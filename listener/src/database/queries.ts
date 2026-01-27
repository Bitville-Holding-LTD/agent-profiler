import { getDatabase } from "./connection.ts";
import type { ProfilingDataRow } from "../types/payloads.ts";

/**
 * Prepared statements for profiling data operations
 *
 * All queries use prepared statements for:
 * - SQL injection protection (even from trusted agents)
 * - Query plan caching
 * - Performance optimization
 */

/**
 * Insert profiling data record
 *
 * @param data Profiling data to insert
 * @returns Inserted row ID
 */
export function insertProfilingData(data: {
  correlation_id: string;
  project: string;
  source: string;
  timestamp: number;
  duration_ms: number | null;
  payload: string;
}): number {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  const stmt = db.prepare(`
    INSERT INTO profiling_data (correlation_id, project, source, timestamp, duration_ms, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.correlation_id,
    data.project,
    data.source,
    data.timestamp,
    data.duration_ms,
    data.payload
  );

  return result.lastInsertRowid as number;
}

/**
 * Query profiling data by correlation ID
 *
 * @param correlationId Correlation ID to search for
 * @returns All records with matching correlation ID
 */
export function queryByCorrelationId(correlationId: string): ProfilingDataRow[] {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  const stmt = db.prepare(`
    SELECT id, correlation_id, project, source, timestamp, duration_ms, payload, created_at
    FROM profiling_data
    WHERE correlation_id = ?
    ORDER BY timestamp ASC
  `);

  return stmt.all(correlationId) as ProfilingDataRow[];
}

/**
 * Query profiling data by project with pagination
 *
 * @param project Project name
 * @param limit Maximum number of records to return
 * @returns Most recent records for project
 */
export function queryByProject(project: string, limit: number = 100): ProfilingDataRow[] {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  const stmt = db.prepare(`
    SELECT id, correlation_id, project, source, timestamp, duration_ms, payload, created_at
    FROM profiling_data
    WHERE project = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(project, limit) as ProfilingDataRow[];
}

/**
 * Query profiling data by project and time range
 *
 * @param project Project name
 * @param startTimestamp Unix timestamp (start of range)
 * @param endTimestamp Unix timestamp (end of range)
 * @returns All records in time range
 */
export function queryByProjectTimeRange(
  project: string,
  startTimestamp: number,
  endTimestamp: number
): ProfilingDataRow[] {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  const stmt = db.prepare(`
    SELECT id, correlation_id, project, source, timestamp, duration_ms, payload, created_at
    FROM profiling_data
    WHERE project = ? AND timestamp BETWEEN ? AND ?
    ORDER BY timestamp ASC
  `);

  return stmt.all(project, startTimestamp, endTimestamp) as ProfilingDataRow[];
}

/**
 * Delete old records (for retention cleanup)
 *
 * @param olderThanTimestamp Unix timestamp - delete records created before this
 * @returns Number of records deleted
 */
export function deleteOldRecords(olderThanTimestamp: number): number {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  const stmt = db.prepare(`
    DELETE FROM profiling_data
    WHERE created_at < ?
  `);

  const result = stmt.run(olderThanTimestamp);
  return result.changes;
}

/**
 * Count records by project
 *
 * @returns Array of {project, count} objects
 */
export function countByProject(): Array<{ project: string; count: number }> {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  const stmt = db.prepare(`
    SELECT project, COUNT(*) as count
    FROM profiling_data
    GROUP BY project
    ORDER BY count DESC
  `);

  return stmt.all() as Array<{ project: string; count: number }>;
}
