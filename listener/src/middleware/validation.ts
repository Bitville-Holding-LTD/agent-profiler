/**
 * Payload validation schemas using Zod
 *
 * Validates incoming JSON payloads from PHP and Postgres agents
 * to ensure data integrity before database storage.
 */

import { z } from "zod";

/**
 * PHP agent payload schema
 *
 * Matches the structure from php-agent/profiling/listener.php
 */
export const PhpPayloadSchema = z.object({
  correlation_id: z.string().min(1),
  project: z.string().min(1).max(50),
  timestamp: z.number(),
  elapsed_ms: z.number(),
  threshold_ms: z.number().optional(),
  request: z.object({
    method: z.string(),
    uri: z.string(),
    query_string: z.string().optional(),
    headers: z.record(z.string()).optional(),
    post_data: z.record(z.unknown()).optional(),
  }),
  response: z.object({
    status_code: z.number().optional(),
    headers: z.record(z.string()).optional(),
  }).optional(),
  timing: z.object({
    start_time: z.number(),
    end_time: z.number(),
    duration_ms: z.number(),
  }).optional(),
  xhprof: z.record(z.unknown()).optional(),
  sql: z.object({
    queries: z.array(z.object({
      query: z.string(),
      duration_ms: z.number(),
      stack_trace: z.array(z.string()).optional(),
    })),
    total_queries: z.number(),
    total_duration_ms: z.number(),
  }).nullable().optional(),
  server: z.object({
    hostname: z.string(),
    php_version: z.string(),
    sapi: z.string(),
  }),
  custom: z.record(z.unknown()).optional(),
  fatal_error: z.object({
    type: z.number(),
    message: z.string(),
    file: z.string(),
    line: z.number(),
  }).optional(),
});

/**
 * Postgres agent payload schema
 *
 * For Phase 5 - Database monitoring integration
 */
export const PostgresPayloadSchema = z.object({
  correlation_id: z.string().optional(),
  project: z.string().min(1).max(50),
  timestamp: z.number(),
  source: z.enum(['pg_stat_activity', 'pg_stat_statements', 'pg_log', 'system_metrics']),
  data: z.record(z.unknown()),
});

// Export TypeScript types inferred from schemas
export type PhpPayload = z.infer<typeof PhpPayloadSchema>;
export type PostgresPayload = z.infer<typeof PostgresPayloadSchema>;
