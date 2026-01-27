/**
 * TypeScript types for profiling payloads from agents
 *
 * These match the payload structure from php-agent/profiling/listener.php
 */

// Matches payload from php-agent/profiling/listener.php
export interface PhpAgentPayload {
  correlation_id: string;
  project: string;
  timestamp: number;  // Unix timestamp (float with microseconds)
  elapsed_ms: number;
  threshold_ms: number;
  request: {
    method: string;
    uri: string;
    query_string?: string;
    headers?: Record<string, string>;
    post_data?: Record<string, unknown>;
  };
  response: {
    status_code?: number;
    headers?: Record<string, string>;
  };
  timing: {
    start_time: number;
    end_time: number;
    duration_ms: number;
  };
  xhprof?: Record<string, unknown>;
  sql?: {
    queries: Array<{
      query: string;
      duration_ms: number;
      stack_trace?: string[];
    }>;
    total_queries: number;
    total_duration_ms: number;
  };
  server: {
    hostname: string;
    php_version: string;
    sapi: string;
  };
  custom?: Record<string, unknown>;
  fatal_error?: {
    type: number;
    message: string;
    file: string;
    line: number;
  };
}

// Postgres agent payload (Phase 5 will define complete structure)
export interface PostgresAgentPayload {
  correlation_id?: string;  // May not have correlation
  project: string;
  timestamp: number;
  source: 'pg_stat_activity' | 'pg_stat_statements' | 'pg_log' | 'system_metrics';
  data: Record<string, unknown>;
}

// Database row type
export interface ProfilingDataRow {
  id: number;
  correlation_id: string;
  project: string;
  source: string;
  timestamp: number;
  duration_ms: number | null;
  payload: string;
  created_at: number;
  forwarded_to_graylog?: number;  // 0=pending, 1=forwarded
}
