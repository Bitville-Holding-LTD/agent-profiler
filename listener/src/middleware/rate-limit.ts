/**
 * Rate limiting middleware
 *
 * Tracks requests per IP address to prevent abuse.
 * Uses sliding window algorithm with in-memory storage.
 *
 * Default: 100 requests per minute per IP
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// In-memory rate limit storage
// Key: IP address, Value: request counts per window
const rateLimits = new Map<string, RateLimitEntry>();

// Configuration (100 requests per minute per IP, per research recommendations)
const WINDOW_MS = 60 * 1000;  // 1 minute window
const MAX_REQUESTS = Number(Bun.env.BITVILLE_RATE_LIMIT) || 100;

// Cleanup interval (remove stale entries every 5 minutes)
let cleanupInterval: Timer | null = null;

/**
 * Check if request is within rate limit
 * @param ip Client IP address
 * @returns Rate limit result with remaining requests
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const entry = rateLimits.get(ip);

  // No entry or expired window - start fresh
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: MAX_REQUESTS - 1,
      resetAt: now + WINDOW_MS,
    };
  }

  // Within window - check count
  if (entry.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + WINDOW_MS,
    };
  }

  // Increment and allow
  entry.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.count,
    resetAt: entry.windowStart + WINDOW_MS,
  };
}

/**
 * Get client IP from request
 * Handles X-Forwarded-For for proxied requests
 */
export function getClientIp(req: Request, server: { requestIP(req: Request): { address: string } | null }): string {
  // Check X-Forwarded-For header (trusted proxy scenario)
  const forwarded = req.headers.get("X-Forwarded-For");
  if (forwarded) {
    // Take first IP (original client)
    return forwarded.split(",")[0].trim();
  }

  // Use direct connection IP
  const ip = server.requestIP(req);
  return ip?.address || "unknown";
}

/**
 * Start periodic cleanup of stale rate limit entries
 */
export function startRateLimitCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [ip, entry] of rateLimits) {
      if (now - entry.windowStart >= WINDOW_MS * 2) {
        rateLimits.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RateLimit] Cleaned ${cleaned} stale entries`);
    }
  }, 5 * 60 * 1000);  // Every 5 minutes
}

/**
 * Stop cleanup interval
 */
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Get current rate limit stats
 */
export function getRateLimitStats(): { activeIps: number; maxRequests: number; windowMs: number } {
  return {
    activeIps: rateLimits.size,
    maxRequests: MAX_REQUESTS,
    windowMs: WINDOW_MS,
  };
}
