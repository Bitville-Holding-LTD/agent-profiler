---
status: complete
phase: 03-central-listener
source:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-03-SUMMARY.md
  - 03-04-SUMMARY.md
started: 2026-01-27T20:30:00Z
updated: 2026-01-27T20:31:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Database Initializes with WAL Mode
expected: Run `bun run listener/src/database/connection.ts` to initialize database. Query `PRAGMA journal_mode` returns "wal" confirming Write-Ahead Logging is enabled.
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 2. Profiling Data Table Exists with Correct Schema
expected: Query `sqlite3 listener.db ".schema profiling_data"` shows unified table with columns: id, correlation_id, project, source, timestamp, duration_ms, payload, created_at
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 3. All 5 Performance Indexes Created
expected: Query `sqlite3 listener.db ".indexes profiling_data"` lists 5 indexes: idx_correlation_id, idx_project_timestamp, idx_duration, idx_source_timestamp, idx_created_at
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 4. HTTP Server Starts with HTTPS
expected: Start listener with `bun run listener/src/server.ts` after setting BITVILLE_TLS_CERT and BITVILLE_TLS_KEY. Server starts on port 8443 (or BITVILLE_PORT) with TLS enabled. Console shows "HTTPS server listening on port 8443"
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 5. Health Endpoint Returns 200
expected: Request `curl http://localhost:8443/health` returns `{"status":"healthy"}` with 200 status code immediately (fast monitoring check)
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 6. Readiness Endpoint Shows Diagnostics
expected: Request `curl http://localhost:8443/ready` returns JSON with database:"connected", apiKeys:(count), uptime:(seconds), cleanup:(status). Status 200 if all healthy, 503 if database unavailable
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 7. PHP Agent Ingestion Requires Authentication
expected: POST to `/ingest/php` without Authorization header returns 401 Unauthorized with error message "Missing Authorization header"
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 8. Invalid API Key Rejected
expected: POST to `/ingest/php` with `Authorization: Bearer invalid-key-123` returns 401 Unauthorized with error message "Invalid API key"
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 9. Valid PHP Agent Payload Stored
expected: Set env var `BITVILLE_API_KEY_TESTPROJECT=test-key-123`. POST to `/ingest/php` with valid Bearer token and PHP agent JSON payload returns 201 Created. Database query shows new row in profiling_data table with source='php_agent'
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 10. Malformed JSON Returns 400
expected: POST to `/ingest/php` with valid Bearer token but invalid JSON (e.g., truncated payload) returns 400 Bad Request with error details about JSON parse failure
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 11. Invalid Schema Returns 400 with Validation Details
expected: POST to `/ingest/php` with valid Bearer token and JSON missing required fields (e.g., no correlation_id) returns 400 Bad Request with Zod validation error listing missing/invalid fields
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 12. Postgres Agent Ingestion Endpoint Works
expected: POST to `/ingest/postgres` with valid Bearer token and Postgres agent JSON payload returns 201 Created. Database query shows new row with source='postgres_agent'
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 13. Cleanup Job Runs on Schedule
expected: After server starts, check logs or database. Old records (>7 days) should be deleted hourly. Query profiling_data for records older than 7 days returns zero rows after cleanup runs
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 14. Manual Cleanup Endpoint Requires Admin Access
expected: POST to `/admin/cleanup` without BITVILLE_ADMIN_ENABLED=true returns 403 Forbidden. With admin enabled and valid API key, returns cleanup statistics
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 15. Graceful Shutdown Completes In-Flight Requests
expected: Start server, send HTTP request, immediately send SIGTERM. Request should complete successfully before server stops (5-second timeout allows completion)
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 16. Rate Limiting Blocks Excessive Requests
expected: Send 110 requests from same IP to `/ingest/php` within 1 minute. First 100 succeed, requests 101+ return 429 Too Many Requests with Retry-After and X-RateLimit-* headers
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 17. UDP Receiver Accepts Data
expected: Configure BITVILLE_UDP_PORT=8444. Send UDP datagram with PHP agent JSON payload to localhost:8444. Database query shows new row stored. No response sent (fire-and-forget)
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 18. UDP Receiver Handles Malformed Data Gracefully
expected: Send UDP datagram with invalid JSON to localhost:8444. Server continues running, logs error but does not crash. UDP stats show error count incremented
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 19. Systemd Service File Exists
expected: File `listener/bitville-listener.service` exists with ExecStart pointing to `bun run src/server.ts`, Restart=always, and security hardening (NoNewPrivileges, ProtectSystem, etc.)
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

### 20. Environment Variable Documentation Complete
expected: File `listener/.env.example` exists documenting all configuration options: BITVILLE_PORT, BITVILLE_UDP_PORT, BITVILLE_DB_PATH, BITVILLE_API_KEY_*, BITVILLE_TLS_CERT, BITVILLE_TLS_KEY, BITVILLE_RATE_LIMIT, BITVILLE_ADMIN_ENABLED
result: skipped
reason: User trusts verification report (22/22 must-haves verified)

## Summary

total: 20
passed: 0
issues: 0
pending: 0
skipped: 20

## Gaps

[none - all tests skipped, verification report confirmed phase goal achieved]
