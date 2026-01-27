/**
 * Circuit Breaker State Persistence
 *
 * Persists circuit breaker state to disk to survive listener restarts.
 * Prevents retry storm when Graylog is down during restart.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const STATE_FILE = Bun.env.BITVILLE_STATE_PATH || "/var/lib/bitville/circuit-breaker-state.json";

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure: number | null;
  lastStateChange: number;
}

/**
 * Load persisted circuit breaker state from disk
 *
 * @returns Persisted state or null if no state file exists
 */
export function loadState(): CircuitBreakerState | null {
  try {
    if (!existsSync(STATE_FILE)) {
      console.log("[Circuit Breaker] No persisted state found, starting fresh");
      return null;
    }

    const content = readFileSync(STATE_FILE, "utf-8");
    const data = JSON.parse(content);

    // Validate structure
    if (data.state && typeof data.failures === 'number') {
      console.log(`[Circuit Breaker] Loaded persisted state: ${data.state}, failures: ${data.failures}`);
      return data as CircuitBreakerState;
    }

    console.warn("[Circuit Breaker] Invalid state file format, starting fresh");
    return null;
  } catch (err) {
    console.error("[Circuit Breaker] Failed to load state:", err);
    return null;
  }
}

/**
 * Save circuit breaker state to disk
 *
 * @param state Current circuit breaker state to persist
 */
export function saveState(state: CircuitBreakerState): void {
  try {
    // Ensure directory exists
    const dir = dirname(STATE_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    console.log(`[Circuit Breaker] State persisted: ${state.state}`);
  } catch (err) {
    console.error("[Circuit Breaker] Failed to save state:", err);
    // Non-fatal: continue operating without persistence
  }
}

/**
 * Get state file path for diagnostics
 */
export function getStateFilePath(): string {
  return STATE_FILE;
}
