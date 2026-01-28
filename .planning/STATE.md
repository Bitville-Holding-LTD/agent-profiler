# Project State: Bitville APM & Centralized Logging

**Project:** Bitville APM & Centralized Logging System
**Current Milestone:** v1.0 - Initial Release
**Status:** Phase 4 Complete - Phase 5 In Progress

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-27)

**Core value:** Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average

**Current focus:** Phase 5 - Postgres Agent Database Monitoring

## Phase Progress

| Phase | Status | Plans | Progress | Commits |
|-------|--------|-------|----------|---------|
| 1 - PHP Agent Core Instrumentation & Safety | ✓ Complete | 6/6 | 100% | a2b8ae0, 713bf51, 980bb51, def8a37 |
| 2 - PHP Agent Daemon Architecture & Lifecycle | ✓ Complete | 4/4 | 100% | 7928601, deee093, 0b74996, 022b19f, 3abb8ef, e7ea204, a3cae67, 5b6c0de, faad6f5, 3038add, ff6fa38 |
| 3 - Central Listener Data Reception & Storage | ✓ Complete | 4/4 | 100% | 410eadc, b6018b5, d01a214, 8861d6e, d862f85, 8931cfa, 1cc0629, eb5b592, 5e2a4eb, d328387, 947b3d4, 9b77fec |
| 4 - Graylog Integration & Forwarding | ✓ Complete | 3/3 | 100% | 41a6638, 51b99d6, 333e848, 1f069a7, ba41f49, 9541cef, 573031b |
| 5 - Postgres Agent Database Monitoring | ◆ In Progress | 1/5 | 20% | b8b6e04, f7e5d44, d03a550 |
| 6 - Query Interface & Visualization | ○ Pending | 0/? | 0% | - |
| 7 - Configuration & Deployment | ○ Pending | 0/? | 0% | - |

**Legend:** ○ Pending | ◆ In Progress | ✓ Complete

**Overall Progress:** ████████████████████████████████████████████████████████████████████████████████████████████░░░░ 94.7% (18/19 plans)

## Milestone Overview

**Total phases:** 7
**Completed:** 4
**In progress:** 1
**Remaining:** 2

**Requirements coverage:**
- Total v1 requirements: 48
- Completed: 23 (Phase 1-2: PHP-01 to PHP-08, COMM-01 to COMM-03, DAEMON-01 to DAEMON-04, Phase 3: STOR-01, STOR-02, LIST-01 to LIST-05, Phase 4: GELF-01 to GELF-05)
- Remaining: 25

## Current Phase

**Phase 5: Postgres Agent Database Monitoring** ◆ IN PROGRESS

**Goal:** Monitor PostgreSQL database for slow queries, locks, and system metrics

**Status:** In progress - Plan 05-02 complete (data collectors)

**Progress:**
- ✅ Plan 05-02: Data Collectors (pg_stat_activity with correlation ID extraction, pg_stat_statements with graceful degradation, lock detection, system metrics)

**Progress:**
- ✅ Plan 04-01: Database Foundation and GELF Client (forwarded_to_graylog tracking, gelf-pro TCP client, replay query functions)
- ✅ Plan 04-02: Circuit Breaker and Forwarder (opossum circuit breaker, state persistence, GELF message building)
- ✅ Plan 04-03: Replay Integration and Handler Wiring (FIFO replay, fire-and-forget forwarding, server initialization)

**Requirements Delivered:**
- ✅ GELF-01: All profiling data forwarded to Graylog
- ✅ GELF-02: GELF TCP transport (gelf-pro library)
- ✅ GELF-03: Circuit breaker pattern (5 failures, 60s retry)
- ✅ GELF-04: SQLite buffering and FIFO replay
- ✅ GELF-05: Project identifier in GELF messages

**Phase 4 (COMPLETE):** Graylog Integration & Forwarding
- ✅ All 3 plans complete:
  - Plan 04-01: Database Foundation and GELF Client (forwarded_to_graylog tracking, gelf-pro TCP client, replay query functions)
  - Plan 04-02: Circuit Breaker and Forwarder (opossum circuit breaker, state persistence, GELF message building)
  - Plan 04-03: Replay Integration and Handler Wiring (FIFO replay, fire-and-forget forwarding, server initialization)

**Phase 3 (COMPLETE):** Central Listener Data Reception & Storage
- ✅ All 4 plans complete:
  - Plan 03-01: Database Foundation (SQLite with WAL mode, unified profiling_data table, prepared statements)
  - Plan 03-02: HTTP Server with Authentication (Bun server, Bearer token auth, Zod validation, dual ingestion endpoints)
  - Plan 03-03: Retention Policy and Systemd Service (7-day cleanup cron, incremental vacuum, systemd with security hardening)
  - Plan 03-04: UDP Receiver and Rate Limiting (UDP fire-and-forget ingestion, sliding window rate limiting, dual-protocol server)

**Phase 2 (COMPLETE):** PHP Agent Daemon Architecture & Lifecycle
- ✅ All 4 requirements delivered (DAEMON-01 to DAEMON-04)
- ✅ All 4 plans complete:
  - Plan 02-01: Daemon Foundation (ReactPHP event loop, socket server, worker lifecycle)
  - Plan 02-02: Buffer Management (memory buffer, disk overflow, FIFO replay)
  - Plan 02-03: Circuit Breaker & Transmitter (failure tracking, HTTP forwarding)
  - Plan 02-04: Daemon Integration & Process Management (health check, periodic transmission, supervisord/systemd)

**Phase 1 (COMPLETE):** PHP Agent Core Instrumentation & Safety
- ✅ All 11 requirements delivered (PHP-01 to PHP-08, COMM-01 to COMM-03)
- ✅ All 6 plans complete

**Next step:** Continue Phase 5 (Plan 05-03: Transmission and Buffering)

## Active Work

**Phase 5 Plan 05-02 COMPLETE** - Data collectors implemented (pg_activity, pg_statements, locks, system metrics).

**Next:** Plan 05-03 - Transmission and Buffering

## Blockers/Concerns

None - Phase 5 Plan 02 complete. Data collectors ready for transmission layer (Plan 05-03).

## Recent Activity

- 2026-01-28: Completed plan 05-02 - Data Collectors (3 tasks, 2min 20sec)
- 2026-01-27: **🎉 PHASE 4 COMPLETE** - Graylog Integration & Forwarding (3/3 plans, 5 requirements)
- 2026-01-27: Completed plan 04-03 - Replay Integration and Handler Wiring (3 tasks, ~4min)
- 2026-01-27: Completed plan 04-02 - Circuit Breaker and Forwarder (2 tasks, 2min 57sec)
- 2026-01-27: Completed plan 04-01 - Database Foundation and GELF Client (2 tasks, 2min 31sec)
- 2026-01-27: **🎉 PHASE 3 COMPLETE** - Central Listener Data Reception & Storage (4/4 plans)
- 2026-01-27: Completed plan 03-04 - UDP Receiver and Rate Limiting (3 tasks, 4min 37sec)
- 2026-01-27: Completed plan 03-03 - Retention Policy and Systemd Service (3 tasks, 3min 6sec)
- 2026-01-27: Completed plan 03-02 - HTTP Server with Authentication (3 tasks, 4min 39sec)
- 2026-01-27: Completed plan 03-01 - Database Foundation (3 tasks, 3min 8sec)
- 2026-01-27: **🎉 PHASE 2 COMPLETE** - PHP Agent Daemon Architecture & Lifecycle (4/4 plans, 4 requirements)
- 2026-01-27: Completed plan 02-04 - Daemon Integration & Process Management (4 tasks, 3min 39sec)
- 2026-01-27: Completed plan 02-03 - Circuit Breaker & Transmitter (2 tasks, 2min)
- 2026-01-27: Completed plan 02-02 - Buffer Management (2 tasks, 1min 58sec)
- 2026-01-27: Completed plan 02-01 - Daemon Foundation (3 tasks, 2min 50sec)
- 2026-01-27: **🎉 PHASE 1 COMPLETE** - PHP Agent Core Instrumentation & Safety (6/6 plans, 11 requirements)
- 2026-01-27: Completed plan 01-06 - listener.php Orchestration (2 tasks, 21min)
- 2026-01-27: Completed plan 01-05 - Request Metadata Collector (3 tasks, 2min 24sec)
- 2026-01-27: Completed plan 01-02 - XHProf Integration (2 tasks, 2min 22sec)
- 2026-01-27: Completed plan 01-04 - Socket Transmission Layer (3 tasks, 2min 12sec)
- 2026-01-27: Completed plan 01-03 - SQL Capture Module (1 task, 1min 47sec)
- 2026-01-27: Completed plan 01-01 - Configuration & Correlation Foundation (3 tasks, 2min 17sec)
- 2026-01-27: Roadmap created (7 phases)
- 2026-01-27: Requirements defined (48 requirements across 10 categories)
- 2026-01-27: Research completed (Stack, Features, Architecture, Pitfalls)
- 2026-01-27: Project initialized

## Key Decisions

| Decision | Rationale | Phase | Date |
|----------|-----------|-------|------|
| Query truncation at 1000 chars (pg_stat_statements) and 500 chars (locks) | Prevents payload bloat in transmission to central listener | 05-02 | 2026-01-28 |
| Correlation ID extraction via regex bitville-([a-f0-9-]{36}) | PHP agent sets application_name to bitville-{uuid} format for request linking | 05-02 | 2026-01-28 |
| Graceful degradation for pg_stat_statements | Check extension availability once, cache result, return empty list if unavailable | 05-02 | 2026-01-28 |
| PostgreSQL wiki lock monitoring query | Use official community query for blocking query detection | 05-02 | 2026-01-28 |
| Timestamp and IP serialization to strings | Convert Python datetime and psycopg IP objects to JSON-compatible strings | 05-02 | 2026-01-28 |
| Batch size 100 with 100ms delay for replay | Prevents overwhelming Graylog during replay while still processing quickly | 04-03 | 2026-01-27 |
| Circuit breaker checks in outer and inner replay loops | Enables clean interruption at batch boundaries or mid-batch | 04-03 | 2026-01-27 |
| Fire-and-forget pattern with .catch() for forwarding | Ensures forwarding errors are logged but never block ingestion responses | 04-03 | 2026-01-27 |
| Recovery callback triggers replay automatically | When circuit breaker closes, replay starts immediately via callback | 04-03 | 2026-01-27 |
| Recovery callback via setImmediate | Non-blocking trigger of replay when circuit closes, prevents blocking state transition | 04-02 | 2026-01-27 |
| GELF message extracts request context | _url, _method, _status_code extracted from payload for Graylog filtering | 04-02 | 2026-01-27 |
| Graceful markAsForwarded handling | Try-catch for database calls in disabled mode ensures test compatibility | 04-02 | 2026-01-27 |
| Circuit breaker volume threshold 5 | Need 5 requests before calculating failure percentage, prevents false opens on startup | 04-02 | 2026-01-27 |
| State persistence restores OPEN only if <60s elapsed | Expired OPEN state (>60s old) starts fresh in CLOSED, avoids permanent open state | 04-02 | 2026-01-27 |
| GELF client disabled by default | Safe rollout without requiring Graylog server upfront, opt-in via GRAYLOG_ENABLED=true | 04-01 | 2026-01-27 |
| Composite index (forwarded_to_graylog, id) | Efficient FIFO replay queries with single index scan for filter+order | 04-01 | 2026-01-27 |
| Dual default pattern for migration | Existing records DEFAULT 1 (assume sent), new inserts explicit 0 (pending) prevents replay storm | 04-01 | 2026-01-27 |
| Rate limiting before authentication | Prevents auth bypass attempts and protects auth middleware from DDoS | 03-04 | 2026-01-27 |
| 429 responses include RFC headers | Retry-After, X-RateLimit-* headers provide client guidance for rate limits | 03-04 | 2026-01-27 |
| Rate limit cleanup every 5 minutes | Removes stale entries (>2 minutes old) to prevent memory growth | 03-04 | 2026-01-27 |
| In-memory rate limit tracking | Simple Map storage sufficient for single-instance, avoids database overhead | 03-04 | 2026-01-27 |
| Rate limiting: 100 requests/minute per IP | Prevents abuse without impacting normal usage, configurable via BITVILLE_RATE_LIMIT | 03-04 | 2026-01-27 |
| No authentication on UDP | UDP has no headers, intended for firewalled internal network | 03-04 | 2026-01-27 |
| UDP port 8444 separate from HTTPS 8443 | Clarity and firewall rule simplicity for dual-protocol server | 03-04 | 2026-01-27 |
| systemd security hardening enabled | Defense in depth: NoNewPrivileges, ProtectSystem, ProtectHome, PrivateTmp | 03-03 | 2026-01-27 |
| Admin cleanup endpoint requires BITVILLE_ADMIN_ENABLED | Manual cleanup is administrative operation, opt-in prevents exposure | 03-03 | 2026-01-27 |
| Graceful shutdown with 5-second timeout for in-flight requests | Allow HTTP requests to complete during restart without data loss | 03-03 | 2026-01-27 |
| Incremental vacuum reclaims 100 pages after cleanup | Non-blocking disk space reclamation without VACUUM lock | 03-03 | 2026-01-27 |
| 7-day retention period (604800 seconds) | STOR-02 requirement for profiling data retention | 03-03 | 2026-01-27 |
| Cleanup runs hourly at minute 0 with immediate startup execution | Prevent disk exhaustion, clean accumulated data from downtime | 03-03 | 2026-01-27 |
| Graceful shutdown allows in-flight requests | Prevent data loss during listener restart (Kubernetes/systemd) | 03-02 | 2026-01-27 |
| Static /health endpoint, dynamic /ready with diagnostics | Health checks fast for frequent polling, readiness detailed for debugging | 03-02 | 2026-01-27 |
| TLS optional: HTTPS when certs provided, HTTP fallback | Simplify development without cert generation, support production security | 03-02 | 2026-01-27 |
| Use authenticated project name, not payload project field | Security - trust API key authentication to prevent project impersonation | 03-02 | 2026-01-27 |
| API keys cached at module initialization | Scanning environment per-request wasteful, O(1) lookup from Map | 03-02 | 2026-01-27 |
| Prepared statements for all queries | SQL injection protection and query plan caching | 03-01 | 2026-01-27 |
| Runtime environment variable reading | DB path read in initDatabase() for testability | 03-01 | 2026-01-27 |
| Partial index on duration_ms | WHERE clause excludes NULL values for smaller index size | 03-01 | 2026-01-27 |
| Unified table for PHP and Postgres data | Simplifies correlation queries and retention policy | 03-01 | 2026-01-27 |
| WAL mode enabled first before any operations | Ensures concurrent reads during writes from start | 03-01 | 2026-01-27 |
| 30 second graceful shutdown timeout | Allows buffer flush to complete before forced termination | 02-04 | 2026-01-27 |
| Newline-delimited JSON for stream protocol | Standard stream protocol for line-based message framing | 02-04 | 2026-01-27 |
| SOCK_STREAM instead of SOCK_DGRAM | Required for ReactPHP UnixServer compatibility | 02-04 | 2026-01-27 |
| 5 second flush interval for transmission | Balances transmission frequency with request batching | 02-04 | 2026-01-27 |
| Health check port 9191 on localhost only | Security: monitoring tools can access but not exposed publicly | 02-04 | 2026-01-27 |
| Circuit breaker opens after 5 consecutive failures | Balance between sensitivity and false positives | 02-03 | 2026-01-27 |
| Circuit breaker retry timeout: 60 seconds | Allow time for central listener recovery without excessive delay | 02-03 | 2026-01-27 |
| Circuit breaker state persists to disk | Prevents retry storm after daemon restart when listener still down | 02-03 | 2026-01-27 |
| HTTP transmission: 5s timeout, 2s connect | Quick failure detection for circuit breaker | 02-03 | 2026-01-27 |
| Memory buffer limit: 100 items | Balances memory usage with disk I/O frequency | 02-02 | 2026-01-27 |
| Disk buffer path: /var/lib/bitville-apm/buffer | Separate from runtime for persistence across restarts | 02-02 | 2026-01-27 |
| FIFO replay on startup | Recovers buffered data from previous daemon run | 02-02 | 2026-01-27 |
| Flush to disk on SIGTERM and worker restart | Prevents data loss during graceful shutdown | 02-02 | 2026-01-27 |
| ReactPHP event loop for daemon | Industry standard for PHP long-running processes | 02-01 | 2026-01-27 |
| SOCK_STREAM sockets for ReactPHP daemon | ReactPHP UnixServer requirement (Plan 02-04 will bridge DGRAM) | 02-01 | 2026-01-27 |
| Worker restart at 256MB or 1000 requests | Prevents memory leaks in long-running daemon | 02-01 | 2026-01-27 |
| Garbage collection every 100 requests | Balance between overhead and memory management | 02-01 | 2026-01-27 |
| SIGTERM/SIGHUP signal handling | Standard Unix daemon conventions | 02-01 | 2026-01-27 |
| Periodic timers: 1s shutdown, 60s stats | Responsive without tight loop, visibility without spam | 02-01 | 2026-01-27 |
| Shutdown function with set_time_limit(0) | Prevent profiler timeout during collection | 01-06 | 2026-01-27 |
| Global variables for component storage | Enable access from shutdown function scope | 01-06 | 2026-01-27 |
| BITVILLE_APM_PROJECT constant | Manual project identification per deployment | 01-06 | 2026-01-27 |
| Helper functions (bitville_apm_*) | Application integration API (correlation ID, custom context) | 01-06 | 2026-01-27 |
| Fatal error capture via error_get_last() | Detect and include fatal errors in profiling payload | 01-06 | 2026-01-27 |
| Complete try-catch at init and shutdown | Double-layer safety prevents any application impact | 01-06 | 2026-01-27 |
| Recursive filtering max depth 5 | Prevent infinite loops in nested data structures | 01-05 | 2026-01-27 |
| String truncation at 1000/500 chars | Memory safety for large values/headers | 01-05 | 2026-01-27 |
| 10 sensitive key patterns defined | Comprehensive coverage (password, token, api_key, etc.) | 01-05 | 2026-01-27 |
| Unix datagram sockets (SOCK_DGRAM) | Fire-and-forget without connection overhead | 01-04 | 2026-01-27 |
| SO_SNDTIMEO at socket level | Guaranteed 50ms timeout enforced by kernel | 01-04 | 2026-01-27 |
| Atomic disk writes (tempnam+rename) | Prevent partial writes if buffer fallback occurs | 01-04 | 2026-01-27 |
| Large data truncation strategy | XHProf top 50, SQL top 100 to fit 64KB datagram limit | 01-04 | 2026-01-27 |
| Phalcon Events Manager for SQL capture | Non-invasive hook pattern, fail gracefully | 01-03 | 2026-01-27 |
| 500 query limit per request | Prevent memory exhaustion on query-heavy pages | 01-03 | 2026-01-27 |
| 5-frame stack traces with no args | Privacy + performance balance | 01-03 | 2026-01-27 |
| Redact sensitive data before storage | Security - password, token, secret, card patterns | 01-03 | 2026-01-27 |
| XHPROF_FLAGS_NO_BUILTINS only | Avoid 200-300% overhead from CPU/memory flags | 01-02 | 2026-01-27 |
| Noise filtering at 1ms threshold | Remove clutter, focus on impactful functions | 01-02 | 2026-01-27 |
| Memory tracking via PHP functions | Independent of XHProf, no performance penalty | 01-02 | 2026-01-27 |
| INI format for configuration | Easy manual editing without PHP knowledge | 01-01 | 2026-01-27 |
| Static caching in config loader | Zero overhead after first read (0.000025ms per call) | 01-01 | 2026-01-27 |
| UUID v4 for correlation IDs | Globally unique, RFC 4122 compliant, proven format | 01-01 | 2026-01-27 |
| Safe defaults (profiling disabled) | Prevent accidental performance impact in production | 01-01 | 2026-01-27 |

## Quick Tasks Completed

None yet.

---

Last activity: 2026-01-28T09:38:52Z - Completed Plan 05-02: Data Collectors (pg_stat_activity, pg_stat_statements, locks, system metrics)
