/**
 * GELF Client for Graylog Integration
 *
 * Wraps gelf-pro library for sending profiling data to Graylog.
 * Configured via environment variables:
 * - GRAYLOG_HOST: Graylog server hostname (default: 127.0.0.1)
 * - GRAYLOG_PORT: GELF TCP port (default: 12201)
 * - GRAYLOG_FACILITY: Facility name for messages (default: bitville-listener)
 */

import gelf from "gelf-pro";

// Configuration from environment
const GRAYLOG_HOST = Bun.env.GRAYLOG_HOST || "127.0.0.1";
const GRAYLOG_PORT = Number(Bun.env.GRAYLOG_PORT) || 12201;
const GRAYLOG_FACILITY = Bun.env.GRAYLOG_FACILITY || "bitville-listener";
const GRAYLOG_ENABLED = Bun.env.GRAYLOG_ENABLED === "true";

let isInitialized = false;

/**
 * Initialize GELF client with TCP adapter
 *
 * @returns true if Graylog integration is enabled
 */
export function initGelfClient(): boolean {
  if (!GRAYLOG_ENABLED) {
    console.log("[Graylog] Integration disabled (set GRAYLOG_ENABLED=true to enable)");
    return false;
  }

  gelf.setConfig({
    fields: {
      facility: GRAYLOG_FACILITY,
      environment: Bun.env.ENVIRONMENT || "production",
    },
    adapterName: "tcp",
    adapterOptions: {
      host: GRAYLOG_HOST,
      port: GRAYLOG_PORT,
      family: 4,        // IPv4
      timeout: 5000,    // 5 second timeout per message
    },
  });

  isInitialized = true;
  console.log(`[Graylog] Client initialized: ${GRAYLOG_HOST}:${GRAYLOG_PORT}`);
  return true;
}

/**
 * Send message to Graylog via GELF TCP
 *
 * @param message GELF message object
 * @returns Promise that resolves on success, rejects on error
 */
export function sendGelfMessage(message: GelfMessage): Promise<void> {
  if (!GRAYLOG_ENABLED) {
    return Promise.resolve();  // Silently skip if disabled
  }

  if (!isInitialized) {
    return Promise.reject(new Error("GELF client not initialized. Call initGelfClient() first."));
  }

  return new Promise((resolve, reject) => {
    // gelf-pro uses callback API, wrap in Promise
    gelf.info(message.short_message, message, (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Check if Graylog integration is enabled and initialized
 */
export function isGraylogEnabled(): boolean {
  return GRAYLOG_ENABLED && isInitialized;
}

/**
 * Get Graylog client status for health checks
 */
export function getGraylogStatus(): { enabled: boolean; host: string; port: number; initialized: boolean } {
  return {
    enabled: GRAYLOG_ENABLED,
    host: GRAYLOG_HOST,
    port: GRAYLOG_PORT,
    initialized: isInitialized,
  };
}

/**
 * GELF message structure
 */
export interface GelfMessage {
  version?: string;
  host?: string;
  short_message: string;
  full_message?: string;
  timestamp?: number;
  level?: number;
  // Custom fields (underscore prefix)
  [key: `_${string}`]: string | number | undefined;
}
