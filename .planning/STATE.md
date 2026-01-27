# Project State: Bitville APM & Centralized Logging

**Project:** Bitville APM & Centralized Logging System
**Current Milestone:** v1.0 - Initial Release
**Status:** Phase 2 Complete - Phase 3 In Progress

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-27)

**Core value:** Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average

**Current focus:** Phase 3 - Central Listener Data Reception & Storage

## Phase Progress

| Phase | Status | Plans | Progress | Commits |
|-------|--------|-------|----------|---------|
| 1 - PHP Agent Core Instrumentation & Safety | ✓ Complete | 6/6 | 100% | a2b8ae0, 713bf51, 980bb51, def8a37 |
| 2 - PHP Agent Daemon Architecture & Lifecycle | ✓ Complete | 4/4 | 100% | 7928601, deee093, 0b74996, 022b19f, 3abb8ef, e7ea204, a3cae67, 5b6c0de, faad6f5, 3038add, ff6fa38 |
| 3 - Central Listener Data Reception & Storage | ◆ In Progress | 2/? | ~40% | 410eadc, b6018b5, d01a214, 8861d6e, d862f85, 8931cfa |
| 4 - Graylog Integration & Forwarding | ○ Pending | 0/? | 0% | - |
| 5 - Postgres Agent Database Monitoring | ○ Pending | 0/? | 0% | - |
| 6 - Query Interface & Visualization | ○ Pending | 0/? | 0% | - |
| 7 - Configuration & Deployment | ○ Pending | 0/? | 0% | - |

**Legend:** ○ Pending | ◆ In Progress | ✓ Complete

**Phase 1 Progress:** ████████████████████████████████████████████████████████████████████████████████████████████ 100% (6/6 plans)

## Milestone Overview

**Total phases:** 7
**Completed:** 2
**In progress:** 1
**Remaining:** 4

**Requirements coverage:**
- Total v1 requirements: 48
- Completed: 15 (Phase 1-2: PHP-01 to PHP-08, COMM-01 to COMM-03, DAEMON-01 to DAEMON-04)
- Remaining: 33

## Current Phase

**Phase 3: Central Listener Data Reception & Storage**

**Goal:** Central server receives, stores, and correlates profiling data from multiple agents

**Status:** In Progress - Plans 03-01 and 03-02 complete

**Progress:**
- ✅ Plan 03-01: Database Foundation (SQLite with WAL mode, unified profiling_data table, prepared statements)
- ✅ Plan 03-02: HTTP Server with Authentication (Bun server, Bearer token auth, Zod validation, dual ingestion endpoints)

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

**Next step:** Continue Phase 3 plans (HTTP ingestion, retention, etc.)

## Active Work

**Phase 3 - Plan 03-02 COMPLETE:** HTTP server with authentication, validation, and ingestion endpoints.

**Next:** Plan 03-03 (Retention & Cleanup) - Automatic data retention with configurable policies.

## Blockers/Concerns

None - database and HTTP ingestion layers complete. Ready for retention policies and Graylog integration.

## Recent Activity

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

Last activity: 2026-01-27T20:06:33Z - Completed plan 03-02 (HTTP Server with Authentication)
