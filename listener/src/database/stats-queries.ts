/**
 * Statistics Queries for Profiling Data
 *
 * Provides aggregate statistics, percentile calculations, and comparison data
 * for performance analysis and comparative benchmarking.
 *
 * Key features:
 * - Aggregate statistics (count, avg, min, max)
 * - Percentile calculations (p50, p95, p99) with fallback for SQLite without percentile()
 * - Comparative analysis (how does request compare to historical data)
 * - SQL injection protection via parameterized queries
 */

import { getDatabase } from "./connection.ts";
import type { ProfilingDataRow } from "../types/payloads.ts";

export interface UrlStatistics {
  url: string;
  count: number;
  avg_duration: number;
  min_duration: number;
  max_duration: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface ProjectStatistics {
  total_records: number;
  total_php_requests: number;
  total_postgres_records: number;
  oldest_timestamp: number | null;
  newest_timestamp: number | null;
  avg_duration: number | null;
  by_source: Array<{ source: string; count: number }>;
}

export interface ComparisonData {
  request: {
    correlation_id: string;
    url: string;
    duration_ms: number;
    timestamp: number;
  };
  comparison: {
    avg_duration: number;
    percentile_rank: number; // What percentile is this request in?
    faster_than_percent: number;
    sample_size: number;
  };
}

/**
 * Get statistics for a specific URL pattern
 *
 * Calculates aggregate metrics and percentiles for requests matching
 * the given URL pattern within a project.
 *
 * @param project - Project name
 * @param url - URL or URL pattern (supports LIKE wildcards)
 * @returns Statistics for matching URLs, or null if no data
 */
export function getUrlStatistics(project: string, url: string): UrlStatistics | null {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized");
  }

  // Add wildcards if not present for flexible matching
  const urlPattern = url.includes("%") ? url : `%${url}%`;

  // Get aggregate statistics
  const aggQuery = `
    SELECT
      ? as url,
      COUNT(*) as count,
      AVG(duration_ms) as avg_duration,
      MIN(duration_ms) as min_duration,
      MAX(duration_ms) as max_duration
    FROM profiling_data
    WHERE project = ? AND url LIKE ? AND duration_ms IS NOT NULL
  `;

  const stmt = db.prepare(aggQuery);
  const agg = stmt.get(url, project, urlPattern) as any;

  // If no matching records, return null
  if (!agg || agg.count === 0) {
    return null;
  }

  // Calculate percentiles using manual approach (compatible with all SQLite versions)
  // Percentile = value at position (N * percentile_fraction)
  const p50 = calculatePercentile(project, urlPattern, 0.50);
  const p95 = calculatePercentile(project, urlPattern, 0.95);
  const p99 = calculatePercentile(project, urlPattern, 0.99);

  return {
    url: agg.url,
    count: agg.count,
    avg_duration: agg.avg_duration,
    min_duration: agg.min_duration,
    max_duration: agg.max_duration,
    p50,
    p95,
    p99,
  };
}

/**
 * Calculate percentile manually using ORDER BY and LIMIT/OFFSET
 *
 * This approach works on all SQLite versions without requiring
 * percentile() aggregate function or window functions.
 *
 * @param project - Project name
 * @param urlPattern - URL pattern for filtering
 * @param percentile - Percentile to calculate (0.50 for median, 0.95, 0.99, etc.)
 * @returns Duration value at the given percentile, or null if insufficient data
 */
function calculatePercentile(project: string, urlPattern: string, percentile: number): number | null {
  const db = getDatabase();
  if (!db) return null;

  // First, get total count
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total
    FROM profiling_data
    WHERE project = ? AND url LIKE ? AND duration_ms IS NOT NULL
  `);
  const countResult = countStmt.get(project, urlPattern) as { total: number };

  if (!countResult || countResult.total === 0) {
    return null;
  }

  // Calculate offset (position in sorted list)
  // For p50 with 100 items: offset = floor(100 * 0.50) = 50
  const offset = Math.floor(countResult.total * percentile);

  // Guard against edge case where offset equals total
  const safeOffset = Math.min(offset, countResult.total - 1);

  // Fetch the value at that position
  const valueStmt = db.prepare(`
    SELECT duration_ms
    FROM profiling_data
    WHERE project = ? AND url LIKE ? AND duration_ms IS NOT NULL
    ORDER BY duration_ms ASC
    LIMIT 1 OFFSET ?
  `);

  const result = valueStmt.get(project, urlPattern, safeOffset) as { duration_ms: number } | undefined;

  return result ? result.duration_ms : null;
}

/**
 * Get project-wide statistics
 *
 * Returns aggregate statistics across all records (or filtered by project).
 * Includes breakdowns by source type (php_agent vs postgres_agent).
 *
 * @param project - Optional project filter (omit for all projects)
 * @returns Project statistics
 */
export function getProjectStatistics(project?: string): ProjectStatistics {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized");
  }

  // Aggregate statistics query
  const aggQuery = `
    SELECT
      COUNT(*) as total_records,
      SUM(CASE WHEN source = 'php_agent' THEN 1 ELSE 0 END) as total_php_requests,
      SUM(CASE WHEN source = 'postgres_agent' THEN 1 ELSE 0 END) as total_postgres_records,
      MIN(timestamp) as oldest_timestamp,
      MAX(timestamp) as newest_timestamp,
      AVG(duration_ms) as avg_duration
    FROM profiling_data
    WHERE ? IS NULL OR project = ?
  `;

  const aggStmt = db.prepare(aggQuery);
  const agg = aggStmt.get(project || null, project || null) as any;

  // Source breakdown query
  const sourceQuery = `
    SELECT source, COUNT(*) as count
    FROM profiling_data
    WHERE ? IS NULL OR project = ?
    GROUP BY source
    ORDER BY count DESC
  `;

  const sourceStmt = db.prepare(sourceQuery);
  const by_source = sourceStmt.all(project || null, project || null) as Array<{ source: string; count: number }>;

  return {
    total_records: agg?.total_records || 0,
    total_php_requests: agg?.total_php_requests || 0,
    total_postgres_records: agg?.total_postgres_records || 0,
    oldest_timestamp: agg?.oldest_timestamp || null,
    newest_timestamp: agg?.newest_timestamp || null,
    avg_duration: agg?.avg_duration || null,
    by_source,
  };
}

/**
 * Get comparison data for a specific request
 *
 * Shows how a request compares to historical averages for the same URL.
 * Calculates percentile rank (what percent of requests were faster/slower).
 *
 * @param correlationId - Correlation ID of the request to analyze
 * @returns Comparison data, or null if request not found
 */
export function getComparisonData(correlationId: string): ComparisonData | null {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized");
  }

  // Fetch the request
  const requestStmt = db.prepare(`
    SELECT correlation_id, url, duration_ms, timestamp
    FROM profiling_data
    WHERE correlation_id = ? AND source = 'php_agent' AND duration_ms IS NOT NULL
    LIMIT 1
  `);

  const request = requestStmt.get(correlationId) as any;

  if (!request) {
    return null;
  }

  // Get average duration for same URL
  const avgStmt = db.prepare(`
    SELECT AVG(duration_ms) as avg_duration, COUNT(*) as sample_size
    FROM profiling_data
    WHERE url = ? AND duration_ms IS NOT NULL
  `);

  const avg = avgStmt.get(request.url) as { avg_duration: number; sample_size: number };

  // Count how many requests were slower than this one
  const slowerStmt = db.prepare(`
    SELECT COUNT(*) as slower_count
    FROM profiling_data
    WHERE url = ? AND duration_ms > ? AND duration_ms IS NOT NULL
  `);

  const slowerResult = slowerStmt.get(request.url, request.duration_ms) as { slower_count: number };

  // Calculate percentile rank
  // If 85 out of 100 requests were slower, this request is at 85th percentile
  const percentile_rank = avg.sample_size > 0
    ? Math.round((slowerResult.slower_count / avg.sample_size) * 100)
    : 0;

  // Faster than percent = requests faster than this one
  const faster_than_percent = 100 - percentile_rank;

  return {
    request: {
      correlation_id: request.correlation_id,
      url: request.url,
      duration_ms: request.duration_ms,
      timestamp: request.timestamp,
    },
    comparison: {
      avg_duration: avg.avg_duration,
      percentile_rank,
      faster_than_percent,
      sample_size: avg.sample_size,
    },
  };
}
