/**
 * Correlation API Endpoint
 *
 * Links PHP requests to their associated SQL queries and monitoring data
 * via correlation ID.
 *
 * Endpoint:
 * - GET /api/correlation/:id - Return all records with matching correlation_id
 *
 * Features:
 * - Groups records by source (php_agent vs postgres_agent)
 * - Calculates summary statistics (total SQL time, counts)
 * - CORS headers for browser access
 */

import { queryByCorrelationId } from "../database/queries.ts";
import type { ProfilingDataRow } from "../types/payloads.ts";

export interface CorrelationTrace {
  php_request: any | null;
  sql_queries: any[];
  other_records: any[];
}

export interface CorrelationSummary {
  total_records: number;
  php_count: number;
  postgres_count: number;
  total_sql_time_ms: number | null;
}

export interface CorrelationResponse {
  correlation_id: string;
  trace: CorrelationTrace;
  summary: CorrelationSummary;
}

/**
 * Handle correlation API requests
 *
 * Returns all profiling records linked by correlation_id,
 * grouped into PHP request, SQL queries, and other records.
 *
 * Path pattern:
 * - GET /api/correlation/:id
 * Query parameter fallback:
 * - GET /api/correlation?correlation_id=abc-123
 *
 * @param req - HTTP request with correlation_id in query params
 * @returns JSON response with grouped correlation data
 */
export function handleGetCorrelation(req: Request): Response {
  try {
    const url = new URL(req.url);

    // Get correlation_id from query parameter
    const correlationId = url.searchParams.get("correlation_id");

    if (!correlationId) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "correlation_id parameter is required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Fetch all records with this correlation_id
    const records = queryByCorrelationId(correlationId);

    if (records.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "No records found for the specified correlation_id",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Group records by source
    const phpRecords: ProfilingDataRow[] = [];
    const postgresRecords: ProfilingDataRow[] = [];
    const otherRecords: ProfilingDataRow[] = [];

    for (const record of records) {
      if (record.source === "php_agent") {
        phpRecords.push(record);
      } else if (record.source === "postgres_agent") {
        postgresRecords.push(record);
      } else {
        otherRecords.push(record);
      }
    }

    // Parse payloads for presentation
    const phpRequest = phpRecords.length > 0
      ? parseRecordPayload(phpRecords[0])
      : null;

    const sqlQueries = postgresRecords.map((record) => parseRecordPayload(record));
    const other = otherRecords.map((record) => parseRecordPayload(record));

    // Calculate summary statistics
    let totalSqlTime = 0;
    for (const record of postgresRecords) {
      try {
        const payload = JSON.parse(record.payload);
        // PostgreSQL agent records have duration_ms in payload
        if (payload.duration_ms !== undefined && payload.duration_ms !== null) {
          totalSqlTime += payload.duration_ms;
        } else if (record.duration_ms !== undefined && record.duration_ms !== null) {
          totalSqlTime += record.duration_ms;
        }
      } catch (err) {
        // Skip malformed payloads
      }
    }

    const response: CorrelationResponse = {
      correlation_id: correlationId,
      trace: {
        php_request: phpRequest,
        sql_queries: sqlQueries,
        other_records: other,
      },
      summary: {
        total_records: records.length,
        php_count: phpRecords.length,
        postgres_count: postgresRecords.length,
        total_sql_time_ms: postgresRecords.length > 0 ? totalSqlTime : null,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error("[Correlation API] Error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

/**
 * Parse record payload safely
 *
 * Returns record with parsed JSON payload, or original record if parsing fails.
 *
 * @param record - Database record
 * @returns Record with parsed payload
 */
function parseRecordPayload(record: ProfilingDataRow): any {
  try {
    const payload = JSON.parse(record.payload);
    return {
      id: record.id,
      project: record.project,
      source: record.source,
      timestamp: record.timestamp,
      duration_ms: record.duration_ms,
      payload,
    };
  } catch (err) {
    // Return original if parsing fails
    return {
      id: record.id,
      project: record.project,
      source: record.source,
      timestamp: record.timestamp,
      duration_ms: record.duration_ms,
      payload: record.payload,
    };
  }
}
