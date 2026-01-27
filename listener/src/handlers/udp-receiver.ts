/**
 * UDP receiver for profiling data
 *
 * Fire-and-forget ingestion for high-throughput scenarios.
 * No authentication (intended for internal network with firewall).
 * No response (UDP is one-way).
 *
 * Use cases:
 * - Very high volume scenarios where HTTP overhead is too much
 * - Network environments where firewall provides security
 * - Acceptable data loss trade-off for performance
 */

import { insertProfilingData } from "../database/queries";
import { PhpPayloadSchema, PostgresPayloadSchema } from "../middleware/validation";
import { forwardInsertedData } from "../graylog/forwarder.ts";

let udpSocket: ReturnType<typeof Bun.udpSocket> | null = null;

// Stats tracking
let receivedCount = 0;
let errorCount = 0;
let lastError: string | null = null;

/**
 * Start UDP server for receiving profiling data
 * UDP is fire-and-forget - no authentication, no response
 * Use for high-throughput scenarios where some data loss is acceptable
 *
 * @param port UDP port to listen on
 */
export async function startUdpServer(port: number): Promise<void> {
  if (udpSocket) {
    console.log("[UDP] Server already running");
    return;
  }

  udpSocket = await Bun.udpSocket({
    port,
    socket: {
      data(socket, buf, remotePort, remoteAddr) {
        receivedCount++;

        try {
          // Parse JSON from buffer
          const text = buf.toString();
          const payload = JSON.parse(text);

          // Determine payload type and validate
          // UDP payloads must include 'source' field to distinguish type
          const source = payload.source || "php_agent";

          if (source === "postgres_agent") {
            const result = PostgresPayloadSchema.safeParse(payload);
            if (!result.success) {
              errorCount++;
              lastError = `Validation failed: ${result.error.message}`;
              return;
            }

            const rowId = insertProfilingData({
              correlation_id: result.data.correlation_id || `udp-${Date.now()}`,
              project: result.data.project,
              source: "postgres_agent",
              timestamp: Math.floor(result.data.timestamp),
              duration_ms: null,
              payload: JSON.stringify(result.data.data),
            });

            // Fire-and-forget async forward to Graylog
            forwardInsertedData(rowId, {
              correlation_id: result.data.correlation_id || `udp-pg-${Date.now()}`,
              project: result.data.project,
              source: "postgres_agent",
              timestamp: Math.floor(result.data.timestamp),
              duration_ms: null,
              payload: JSON.stringify(result.data.data),
            }).catch(err => {
              console.error(`[UDP] Graylog forward failed for row ${rowId}:`, err);
            });
          } else {
            // Default: PHP agent
            const result = PhpPayloadSchema.safeParse(payload);
            if (!result.success) {
              errorCount++;
              lastError = `Validation failed: ${result.error.message}`;
              return;
            }

            const rowId = insertProfilingData({
              correlation_id: result.data.correlation_id,
              project: result.data.project,
              source: "php_agent",
              timestamp: Math.floor(result.data.timestamp),
              duration_ms: result.data.elapsed_ms,
              payload: JSON.stringify(payload),
            });

            // Fire-and-forget async forward to Graylog
            forwardInsertedData(rowId, {
              correlation_id: result.data.correlation_id || `udp-php-${Date.now()}`,
              project: result.data.project,
              source: "php_agent",
              timestamp: Math.floor(result.data.timestamp),
              duration_ms: result.data.elapsed_ms,
              payload: JSON.stringify(payload),
            }).catch(err => {
              console.error(`[UDP] Graylog forward failed for row ${rowId}:`, err);
            });
          }
        } catch (error) {
          errorCount++;
          lastError = error instanceof Error ? error.message : "Unknown error";
          // UDP is fire-and-forget - log but don't crash
          console.error(`[UDP] Error processing packet from ${remoteAddr}:${remotePort}:`, error);
        }
      },
    },
  });

  console.log(`[UDP] Server started on port ${port}`);
}

/**
 * Stop UDP server
 */
export function stopUdpServer(): void {
  if (udpSocket) {
    udpSocket.close();
    udpSocket = null;
    console.log("[UDP] Server stopped");
  }
}

/**
 * Get UDP server stats
 */
export function getUdpStats(): {
  running: boolean;
  port: number | null;
  received: number;
  errors: number;
  lastError: string | null;
} {
  return {
    running: udpSocket !== null,
    port: udpSocket?.port ?? null,
    received: receivedCount,
    errors: errorCount,
    lastError,
  };
}
