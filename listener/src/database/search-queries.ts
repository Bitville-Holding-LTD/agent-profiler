/**
 * Search Queries for Profiling Data
 *
 * Provides cursor-based pagination and filtering for profiling records.
 * Uses indexed virtual columns for efficient URL filtering.
 *
 * Key features:
 * - Cursor-based pagination (timestamp-based, constant time)
 * - Multiple filter dimensions (project, source, url, duration, timestamp)
 * - SQL injection protection via parameterized queries
 * - Index-optimized queries for performance
 */

import { getDatabase } from "./connection.ts";
import type { ProfilingDataRow } from "../types/payloads.ts";

export interface SearchParams {
  project?: string;
  source?: "php_agent" | "postgres_agent";
  correlation_id?: string;
  url?: string; // Uses virtual column, supports LIKE patterns
  duration_min?: number; // Minimum duration in ms
  duration_max?: number; // Maximum duration in ms
  timestamp_start?: number; // Unix timestamp
  timestamp_end?: number; // Unix timestamp
  after?: number; // Cursor: timestamp to start after
  limit?: number; // Default 50, max 100
}

export interface SearchResult {
  items: ProfilingDataRow[];
  cursor: number | null; // Next timestamp cursor, null if no more results
  total_estimate?: number; // Approximate total matching records
}

/**
 * Search profiling data with cursor-based pagination
 *
 * Builds dynamic query based on provided filters and returns
 * paginated results. Fetches limit+1 rows to detect if more results exist.
 *
 * @param params - Search parameters
 * @returns Search result with items and next cursor
 */
export function paginatedSearch(params: SearchParams): SearchResult {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized");
  }

  // Build query dynamically based on filters
  const conditions: string[] = ["1=1"];
  const bindings: (string | number)[] = [];

  // Project filter
  if (params.project) {
    conditions.push("project = ?");
    bindings.push(params.project);
  }

  // Source filter (php_agent or postgres_agent)
  if (params.source) {
    conditions.push("source = ?");
    bindings.push(params.source);
  }

  // Correlation ID filter
  if (params.correlation_id) {
    conditions.push("correlation_id = ?");
    bindings.push(params.correlation_id);
  }

  // URL filter (uses indexed virtual column)
  if (params.url) {
    conditions.push("url LIKE ?");
    // Add wildcards if not already present
    bindings.push(params.url.includes("%") ? params.url : `%${params.url}%`);
  }

  // Duration range filters
  if (params.duration_min !== undefined) {
    conditions.push("duration_ms >= ?");
    bindings.push(params.duration_min);
  }
  if (params.duration_max !== undefined) {
    conditions.push("duration_ms <= ?");
    bindings.push(params.duration_max);
  }

  // Timestamp range filters
  if (params.timestamp_start !== undefined) {
    conditions.push("timestamp >= ?");
    bindings.push(params.timestamp_start);
  }
  if (params.timestamp_end !== undefined) {
    conditions.push("timestamp <= ?");
    bindings.push(params.timestamp_end);
  }

  // Cursor-based pagination (timestamp < after for reverse chronological)
  if (params.after !== undefined) {
    conditions.push("timestamp < ?");
    bindings.push(params.after);
  }

  // Determine limit (default 50, max 100)
  const limit = Math.min(params.limit || 50, 100);
  const fetchLimit = limit + 1; // Fetch extra to detect "has more"

  // Build final query
  const query = `
    SELECT
      id,
      correlation_id,
      project,
      source,
      timestamp,
      duration_ms,
      payload,
      created_at,
      url,
      http_method,
      status_code
    FROM profiling_data
    WHERE ${conditions.join(" AND ")}
    ORDER BY timestamp DESC
    LIMIT ?
  `;
  bindings.push(fetchLimit);

  // Execute query
  const stmt = db.query<ProfilingDataRow, (string | number)[]>(query);
  const rows = stmt.all(...bindings);

  // Determine if more results exist
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Calculate next cursor (timestamp of last item)
  const cursor = hasMore && items.length > 0 ? items[items.length - 1].timestamp : null;

  return {
    items,
    cursor,
  };
}

/**
 * Get list of unique project names
 *
 * Used for project filter dropdown in UI.
 *
 * @returns Array of project names
 */
export function getProjects(): string[] {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized");
  }

  const stmt = db.query<{ project: string }, []>(
    "SELECT DISTINCT project FROM profiling_data ORDER BY project"
  );
  const rows = stmt.all();

  return rows.map((row) => row.project);
}

/**
 * Get aggregate statistics
 *
 * Returns total record count and timestamp range.
 * Optionally filter by project.
 *
 * @param project - Optional project filter
 * @returns Statistics object
 */
export function getStatistics(project?: string): {
  total_records: number;
  oldest_timestamp: number | null;
  newest_timestamp: number | null;
} {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized");
  }

  const conditions: string[] = ["1=1"];
  const bindings: string[] = [];

  if (project) {
    conditions.push("project = ?");
    bindings.push(project);
  }

  const query = `
    SELECT
      COUNT(*) as total_records,
      MIN(timestamp) as oldest_timestamp,
      MAX(timestamp) as newest_timestamp
    FROM profiling_data
    WHERE ${conditions.join(" AND ")}
  `;

  const stmt = db.query<
    { total_records: number; oldest_timestamp: number | null; newest_timestamp: number | null },
    string[]
  >(query);

  const result = stmt.get(...bindings);

  return result || { total_records: 0, oldest_timestamp: null, newest_timestamp: null };
}
