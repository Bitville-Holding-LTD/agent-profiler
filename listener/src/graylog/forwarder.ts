/**
 * Graylog Forwarder Module
 *
 * Main forwarding logic that:
 * 1. Builds GELF messages from profiling data
 * 2. Sends through circuit breaker
 * 3. Marks records as forwarded on success
 *
 * Requirements covered:
 * - GELF-01: Forward all received data to Graylog in GELF format
 * - GELF-05: Include project identifier in all GELF messages
 */

import { sendThroughCircuitBreaker, isCircuitOpen } from "./circuit-breaker.ts";
import { isGraylogEnabled, type GelfMessage } from "./client.ts";
import { markAsForwarded } from "../database/queries.ts";
import type { ProfilingDataRow } from "../types/payloads.ts";

/**
 * Build GELF message from profiling data record
 *
 * Maps profiling_data columns and payload to GELF message structure:
 * - Standard GELF fields: version, host, short_message, timestamp, level
 * - Custom fields: _correlation_id, _project, _source, _duration_ms, etc.
 *
 * @param record Database row from profiling_data table
 * @returns GELF message object ready for sending
 */
export function buildGelfMessage(record: ProfilingDataRow): GelfMessage {
  // Parse payload JSON for additional fields
  let payload: Record<string, any> = {};
  try {
    payload = JSON.parse(record.payload);
  } catch {
    // If payload is not valid JSON, use empty object
  }

  const message: GelfMessage = {
    // Required GELF fields
    version: "1.1",
    host: record.source,  // "php_agent" or "postgres_agent"
    short_message: `${record.source} - ${record.project}`,

    // Optional GELF fields
    timestamp: record.timestamp,
    level: 6,  // INFO level (syslog)
    full_message: record.payload,  // Complete JSON payload

    // Core custom fields (underscore prefix required by GELF spec)
    _correlation_id: record.correlation_id,
    _project: record.project,
    _source: record.source,
    _row_id: record.id,
  };

  // Add duration_ms if present
  if (record.duration_ms !== null) {
    message._duration_ms = record.duration_ms;
  }

  // Extract request context from payload (for PHP agent data)
  if (payload.request?.uri) {
    message._url = String(payload.request.uri).slice(0, 500);  // Truncate long URLs
  }
  if (payload.request?.method) {
    message._method = payload.request.method;
  }
  if (payload.response?.status_code) {
    message._status_code = payload.response.status_code;
  }

  // Extract SQL summary if present
  if (payload.sql?.total_queries !== undefined) {
    message._sql_queries = payload.sql.total_queries;
    message._sql_duration_ms = payload.sql.total_duration_ms;
  }

  // Extract memory info if present
  if (payload.memory?.peak_mb !== undefined) {
    message._memory_peak_mb = payload.memory.peak_mb;
  }

  // Add server info if present
  if (payload.server?.hostname) {
    message._server_hostname = payload.server.hostname;
  }

  return message;
}

/**
 * Forward profiling data record to Graylog
 *
 * Fire-and-forget pattern: Returns quickly, forwarding happens async.
 * If circuit breaker is open, returns immediately without sending.
 *
 * @param rowId Database row ID (for marking as forwarded)
 * @param record Full record data (for building GELF message)
 * @returns Promise that resolves when forwarding completes (or skips)
 */
export async function forwardToGraylog(rowId: number, record: ProfilingDataRow): Promise<void> {
  // Skip if Graylog integration disabled
  if (!isGraylogEnabled()) {
    // Mark as forwarded anyway to prevent replay attempts (when DB is available)
    try {
      markAsForwarded(rowId);
    } catch {
      // DB not initialized (e.g., in tests), silently skip
    }
    return;
  }

  // Skip if circuit breaker is open (fail-fast)
  if (isCircuitOpen()) {
    console.log(`[Forwarder] Circuit open, skipping forward for row ${rowId}`);
    return;  // Record stays with forwarded_to_graylog = 0 for later replay
  }

  try {
    // Build GELF message
    const gelfMessage = buildGelfMessage(record);

    // Send through circuit breaker
    await sendThroughCircuitBreaker(gelfMessage);

    // Mark as forwarded on success
    markAsForwarded(rowId);

    console.log(`[Forwarder] Forwarded row ${rowId} to Graylog (project: ${record.project})`);
  } catch (err) {
    // Circuit breaker will handle state transitions
    // Log error but don't throw - this is fire-and-forget
    console.error(`[Forwarder] Failed to forward row ${rowId}:`, err);
    // Record stays with forwarded_to_graylog = 0 for later replay
  }
}

/**
 * Forward data with inline record construction
 *
 * Convenience function for handlers that builds ProfilingDataRow from insert params.
 * Avoids re-reading from database after insert.
 *
 * @param rowId Inserted row ID
 * @param data Data that was inserted (same shape as insert params)
 */
export async function forwardInsertedData(
  rowId: number,
  data: {
    correlation_id: string;
    project: string;
    source: string;
    timestamp: number;
    duration_ms: number | null;
    payload: string;
  }
): Promise<void> {
  const record: ProfilingDataRow = {
    id: rowId,
    correlation_id: data.correlation_id,
    project: data.project,
    source: data.source,
    timestamp: data.timestamp,
    duration_ms: data.duration_ms,
    payload: data.payload,
    created_at: Math.floor(Date.now() / 1000),
  };

  return forwardToGraylog(rowId, record);
}

/**
 * Check if Graylog forwarding would currently succeed
 *
 * Used by handlers to decide if they should attempt forwarding.
 */
export function canForward(): boolean {
  return isGraylogEnabled() && !isCircuitOpen();
}
