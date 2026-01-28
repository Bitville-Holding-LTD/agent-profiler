/**
 * Central Listener HTTP Server
 *
 * Main entry point for the Bitville APM & Centralized Logging system.
 * Receives profiling data from PHP agents and Postgres monitoring agents.
 *
 * Features:
 * - TLS/HTTPS support (optional for development)
 * - API key authentication
 * - JSON payload validation
 * - SQLite storage with WAL mode
 * - Health and readiness endpoints
 *
 * Environment variables:
 * - BITVILLE_PORT: Server port (default: 8443)
 * - BITVILLE_TLS_KEY_PATH: Path to TLS private key (optional)
 * - BITVILLE_TLS_CERT_PATH: Path to TLS certificate (optional)
 * - BITVILLE_DB_PATH: SQLite database path (default: /var/lib/bitville/listener.db)
 * - BITVILLE_API_KEY_*: API keys for projects (e.g., BITVILLE_API_KEY_MYPROJECT=key)
 */

import { initDatabase, getDatabase } from "./database/connection.ts";
import { handlePhpAgent } from "./handlers/php-agent.ts";
import { handlePostgresAgent } from "./handlers/postgres-agent.ts";
import { getApiKeyCount } from "./middleware/auth.ts";
import { startCleanupJob, stopCleanupJob, runCleanupNow, getCleanupStatus } from "./database/cleanup.ts";
import { checkRateLimit, getClientIp, startRateLimitCleanup, stopRateLimitCleanup, getRateLimitStats } from "./middleware/rate-limit.ts";
import { startUdpServer, stopUdpServer, getUdpStats } from "./handlers/udp-receiver.ts";
import { initGelfClient, getGraylogStatus } from "./graylog/client.ts";
import { createCircuitBreaker, getCircuitBreakerStatus } from "./graylog/circuit-breaker.ts";
import { replayUnforwardedRecords, getReplayStatus } from "./graylog/replay.ts";
import { handleSearch, handleGetProjects, handleGetStatistics } from "./api/search.ts";

// Initialize database on startup
console.log("[Listener] Initializing database...");
const db = initDatabase();
console.log("[Listener] Database initialized successfully");

// Initialize Graylog integration
console.log("[Listener] Initializing Graylog integration...");
const graylogEnabled = initGelfClient();
if (graylogEnabled) {
  // Create circuit breaker with replay callback
  createCircuitBreaker(() => {
    // Called when circuit closes (Graylog recovers)
    replayUnforwardedRecords().catch(err => {
      console.error("[Listener] Replay failed:", err);
    });
  });
  console.log("[Listener] Graylog integration initialized");
} else {
  console.log("[Listener] Graylog integration disabled");
}

// Start hourly cleanup job
startCleanupJob();

// Start rate limit cleanup
startRateLimitCleanup();

// Configure server
const PORT = Number(Bun.env.BITVILLE_PORT) || 8443;
const TLS_KEY_PATH = Bun.env.BITVILLE_TLS_KEY_PATH;
const TLS_CERT_PATH = Bun.env.BITVILLE_TLS_CERT_PATH;

// Determine TLS configuration
const tlsConfig = TLS_KEY_PATH && TLS_CERT_PATH ? {
  key: Bun.file(TLS_KEY_PATH),
  cert: Bun.file(TLS_CERT_PATH),
} : undefined;

const protocol = tlsConfig ? "HTTPS" : "HTTP";

// Start UDP server if port configured
const UDP_PORT = Number(Bun.env.BITVILLE_UDP_PORT);
if (UDP_PORT) {
  await startUdpServer(UDP_PORT);
}

// Start server
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",

  // TLS configuration (optional)
  tls: tlsConfig,

  // Request handler
  async fetch(req: Request, server: any): Promise<Response> {
    const url = new URL(req.url);

    // Dashboard UI (Phase 6) - serve at root
    if (req.method === "GET" && url.pathname === "/") {
      const html = Bun.file(import.meta.dir + "/../public/index.html");
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Serve static assets (JS, CSS)
    if (req.method === "GET" && (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
      const filePath = import.meta.dir + "/../public" + url.pathname;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const contentType = url.pathname.endsWith(".js") ? "application/javascript" : "text/css";
        return new Response(file, {
          headers: { "content-type": contentType },
        });
      }
    }

    // CORS preflight handler
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Health check endpoint (static, fast)
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    // Readiness endpoint (dynamic, includes diagnostics)
    if (req.method === "GET" && url.pathname === "/ready") {
      const dbHealthy = getDatabase() !== null;
      const apiKeyCount = getApiKeyCount();
      const cleanup = getCleanupStatus();
      const udp = getUdpStats();
      const rateLimit = getRateLimitStats();
      const graylog = getGraylogStatus();
      const circuitBreaker = getCircuitBreakerStatus();
      const replay = getReplayStatus();

      return new Response(JSON.stringify({
        ready: dbHealthy && apiKeyCount > 0,
        uptime: process.uptime(),
        database: dbHealthy ? "connected" : "disconnected",
        api_keys: apiKeyCount,
        cleanup: {
          running: cleanup.running,
          nextRun: cleanup.nextRun?.toISOString(),
          retentionDays: cleanup.retentionDays,
        },
        udp: {
          enabled: udp.running,
          port: udp.port,
          received: udp.received,
          errors: udp.errors,
        },
        rateLimit: {
          activeIps: rateLimit.activeIps,
          maxRequests: rateLimit.maxRequests,
        },
        graylog: {
          enabled: graylog.enabled,
          host: graylog.host,
          port: graylog.port,
          initialized: graylog.initialized,
          circuitBreaker: circuitBreaker.state,
          stats: circuitBreaker.stats,
        },
        replay: {
          pending: replay.pendingCount,
          isReplaying: replay.isReplaying,
          lastReplay: replay.lastReplay,
        },
      }), {
        status: dbHealthy && apiKeyCount > 0 ? 200 : 503,
        headers: { "content-type": "application/json" },
      });
    }

    // Admin endpoints (optional, enabled via BITVILLE_ADMIN_ENABLED=true)
    if (Bun.env.BITVILLE_ADMIN_ENABLED === "true") {
      if (req.method === "POST" && url.pathname === "/admin/cleanup") {
        // Import auth inline to avoid circular deps
        const { authenticateRequest } = await import("./middleware/auth.ts");
        const auth = authenticateRequest(req);
        if (!auth.isValid) {
          return new Response(JSON.stringify({
            error: "Unauthorized",
            message: "Valid API key required"
          }), {
            status: 401,
            headers: { "content-type": "application/json" }
          });
        }

        const deleted = runCleanupNow();
        return new Response(JSON.stringify({ deleted }), {
          headers: { "content-type": "application/json" }
        });
      }
    }

    // Query API endpoints (Phase 6)
    if (req.method === "GET" && url.pathname === "/api/search") {
      return handleSearch(req);
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      return handleGetProjects(req);
    }

    if (req.method === "GET" && url.pathname === "/api/statistics") {
      return handleGetStatistics(req);
    }

    // Apply rate limiting for ingest endpoints
    if (url.pathname.startsWith("/ingest")) {
      const clientIp = getClientIp(req, server);
      const rateLimit = checkRateLimit(clientIp);

      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({
          error: "Too Many Requests",
          message: "Rate limit exceeded",
        }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(getRateLimitStats().maxRequests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(rateLimit.resetAt / 1000)),
          },
        });
      }
    }

    // Ingestion endpoints (require POST)
    if (req.method === "POST") {
      if (url.pathname === "/ingest/php") {
        return handlePhpAgent(req);
      }

      if (url.pathname === "/ingest/postgres") {
        return handlePostgresAgent(req);
      }
    }

    // Unknown route
    return new Response(JSON.stringify({
      error: "Not Found",
      message: `Route ${req.method} ${url.pathname} not found`,
    }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  },

  // Error handler
  error(error: Error): Response {
    console.error("[Server Error]", error);
    return new Response(JSON.stringify({
      error: "Internal Server Error",
      message: error.message,
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  },
});

// Log startup message
console.log(`[Listener] ${protocol} server listening on port ${PORT}`);
console.log(`[Listener] Dashboard: ${protocol.toLowerCase()}://localhost:${PORT}/`);
console.log(`[Listener] Health check: ${protocol.toLowerCase()}://localhost:${PORT}/health`);
console.log(`[Listener] Readiness check: ${protocol.toLowerCase()}://localhost:${PORT}/ready`);
console.log(`[Listener] Query API: ${protocol.toLowerCase()}://localhost:${PORT}/api/search`);
console.log(`[Listener] PHP agent endpoint: ${protocol.toLowerCase()}://localhost:${PORT}/ingest/php`);
console.log(`[Listener] Postgres agent endpoint: ${protocol.toLowerCase()}://localhost:${PORT}/ingest/postgres`);
console.log(`[Listener] Loaded ${getApiKeyCount()} API key(s)`);
if (graylogEnabled) {
  const graylog = getGraylogStatus();
  console.log(`[Listener] Graylog forwarding: ${graylog.host}:${graylog.port}`);
}

// Graceful shutdown handler
const shutdown = () => {
  console.log("[Listener] Shutting down gracefully...");

  // Stop all background services
  stopCleanupJob();
  stopRateLimitCleanup();
  stopUdpServer();
  // Note: Graylog circuit breaker state is already persisted on state changes

  // Stop accepting new connections (allow in-flight requests to complete)
  server.stop(false);

  // Give requests 5 seconds to complete, then close database
  setTimeout(() => {
    const database = getDatabase();
    if (database) {
      database.close();
      console.log("[Listener] Database closed");
    }
    console.log("[Listener] Shutdown complete");
    process.exit(0);
  }, 5000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Log unhandled errors (but don't crash)
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Listener] Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Listener] Uncaught Exception:", error);
  // In production, you might want to exit here
  // process.exit(1);
});
