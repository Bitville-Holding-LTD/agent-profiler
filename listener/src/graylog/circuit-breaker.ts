/**
 * Circuit Breaker for Graylog Connection
 *
 * Wraps GELF send operation with circuit breaker pattern:
 * - Opens after 5 consecutive failures (50% threshold with volume 5)
 * - Retries after 60 seconds
 * - Persists state to disk for restart resilience
 */

import CircuitBreaker from "opossum";
import { sendGelfMessage, type GelfMessage, isGraylogEnabled } from "./client.ts";
import { loadState, saveState, type CircuitBreakerState } from "./state.ts";

// Circuit breaker configuration (matches Phase 2 PHP agent)
const TIMEOUT_MS = 5000;              // 5 second timeout per send
const ERROR_THRESHOLD = 50;           // Open after 50% failures
const RESET_TIMEOUT_MS = 60000;       // 60 second retry timeout
const VOLUME_THRESHOLD = 5;           // Need 5 requests before calculating %

let breaker: CircuitBreaker | null = null;
let onRecoveryCallback: (() => void) | null = null;

/**
 * Create and configure circuit breaker
 *
 * @param onRecovery Callback to trigger replay when circuit closes
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker(onRecovery?: () => void): CircuitBreaker {
  if (breaker) {
    return breaker;
  }

  // Store recovery callback for later invocation
  onRecoveryCallback = onRecovery || null;

  // Load persisted state
  const persistedState = loadState();

  // Create circuit breaker wrapping sendGelfMessage
  breaker = new CircuitBreaker(sendGelfMessage, {
    timeout: TIMEOUT_MS,
    errorThresholdPercentage: ERROR_THRESHOLD,
    resetTimeout: RESET_TIMEOUT_MS,
    volumeThreshold: VOLUME_THRESHOLD,
    name: "graylog-gelf",
  });

  // Restore state from disk if available and circuit should be open
  if (persistedState?.state === 'OPEN') {
    // Check if enough time has passed to transition to half-open
    const timeSinceStateChange = Date.now() - persistedState.lastStateChange;
    if (timeSinceStateChange < RESET_TIMEOUT_MS) {
      // Force circuit open by triggering failures
      console.log("[Circuit Breaker] Restoring OPEN state from disk");
      breaker.open();
    } else {
      console.log("[Circuit Breaker] Persisted OPEN state expired, starting in CLOSED");
    }
  }

  // Event handlers for state persistence
  breaker.on("open", () => {
    console.log("[Circuit Breaker] OPEN - Graylog unavailable, buffering locally");
    persistCurrentState("OPEN");
  });

  breaker.on("close", () => {
    console.log("[Circuit Breaker] CLOSED - Graylog recovered");
    persistCurrentState("CLOSED");

    // Trigger replay of buffered records
    if (onRecoveryCallback) {
      console.log("[Circuit Breaker] Triggering replay of buffered records...");
      // Use setImmediate to not block the close event
      setImmediate(() => {
        onRecoveryCallback!();
      });
    }
  });

  breaker.on("halfOpen", () => {
    console.log("[Circuit Breaker] HALF-OPEN - Testing Graylog connection");
    persistCurrentState("HALF_OPEN");
  });

  breaker.on("fallback", () => {
    // Called when circuit is open and request is rejected
    console.log("[Circuit Breaker] Request rejected (circuit open)");
  });

  breaker.on("failure", (err: Error) => {
    console.error("[Circuit Breaker] GELF send failed:", err.message);
  });

  breaker.on("success", () => {
    // Normal operation, no logging needed
  });

  console.log("[Circuit Breaker] Initialized with 60s retry timeout, 5-request volume threshold");
  return breaker;
}

/**
 * Persist current circuit breaker state to disk
 */
function persistCurrentState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
  if (!breaker) return;

  const stats = breaker.stats;
  const cbState: CircuitBreakerState = {
    state,
    failures: stats.failures,
    lastFailure: stats.latency?.mean || null,
    lastStateChange: Date.now(),
  };

  saveState(cbState);
}

/**
 * Send GELF message through circuit breaker
 *
 * @param message GELF message to send
 * @returns Promise that resolves on success, rejects if circuit open or send fails
 */
export async function sendThroughCircuitBreaker(message: GelfMessage): Promise<void> {
  if (!isGraylogEnabled()) {
    return;  // Silently skip when disabled
  }

  if (!breaker) {
    throw new Error("Circuit breaker not initialized. Call createCircuitBreaker() first.");
  }

  return breaker.fire(message);
}

/**
 * Get circuit breaker status for health checks
 */
export function getCircuitBreakerStatus(): {
  state: string;
  enabled: boolean;
  stats: {
    failures: number;
    successes: number;
    rejects: number;
    timeouts: number;
  };
} {
  if (!breaker) {
    return {
      state: "NOT_INITIALIZED",
      enabled: false,
      stats: { failures: 0, successes: 0, rejects: 0, timeouts: 0 },
    };
  }

  const stats = breaker.stats;
  return {
    state: breaker.opened ? "OPEN" : breaker.halfOpen ? "HALF_OPEN" : "CLOSED",
    enabled: true,
    stats: {
      failures: stats.failures,
      successes: stats.successes,
      rejects: stats.rejects,
      timeouts: stats.timeouts,
    },
  };
}

/**
 * Check if circuit breaker is open (Graylog unavailable)
 */
export function isCircuitOpen(): boolean {
  return breaker?.opened ?? false;
}

/**
 * Get circuit breaker instance for testing
 */
export function getCircuitBreaker(): CircuitBreaker | null {
  return breaker;
}
