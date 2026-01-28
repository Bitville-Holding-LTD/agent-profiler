# Project State: Bitville APM & Centralized Logging

**Project:** Bitville APM & Centralized Logging System
**Current Milestone:** v1.0 - Initial Release
**Status:** Phase 5 Complete

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-27)

**Core value:** Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average

**Current focus:** Phase 6 - Query Interface & Visualization

## Phase Progress

| Phase | Status | Plans | Progress | Commits |
|-------|--------|-------|----------|---------|
| 1 - PHP Agent Core Instrumentation & Safety | ✓ Complete | 6/6 | 100% | a2b8ae0, 713bf51, 980bb51, def8a37 |
| 2 - PHP Agent Daemon Architecture & Lifecycle | ✓ Complete | 4/4 | 100% | 7928601, deee093, 0b74996, 022b19f, 3abb8ef, e7ea204, a3cae67, 5b6c0de, faad6f5, 3038add, ff6fa38 |
| 3 - Central Listener Data Reception & Storage | ✓ Complete | 4/4 | 100% | 410eadc, b6018b5, d01a214, 8861d6e, d862f85, 8931cfa, 1cc0629, eb5b592, 5e2a4eb, d328387, 947b3d4, 9b77fec |
| 4 - Graylog Integration & Forwarding | ✓ Complete | 3/3 | 100% | 41a6638, 51b99d6, 333e848, 1f069a7, ba41f49, 9541cef, 573031b |
| 5 - Postgres Agent Database Monitoring | ✓ Complete | 4/4 | 100% | 31bdde3, 1f7fe49, 660f5e2, b8b6e04, f7e5d44, d03a550, 644c6cd, 2d1d183, 218b56e, 827aef9, 41b2979, 941b54c, 2b934a5 |
| 6 - Query Interface & Visualization | ◆ In Progress | 2/4 | 50% | 0539068, 31a4e98, 8da2be2, f26449f |
| 7 - Configuration & Deployment | ○ Pending | 0/? | 0% | - |

**Legend:** ○ Pending | ◆ In Progress | ✓ Complete

**Overall Progress:** █████████████████████████████████████████████████████████████████████████████████████████████████████████░░░░░░░░ 91% (22/24 plans)

## Milestone Overview

**Total phases:** 7
**Completed:** 5
**In progress:** 1
**Remaining:** 1

**Requirements coverage:**
- Total v1 requirements: 48
- Completed: 34 (Phase 1-2: PHP-01 to PHP-08, COMM-01 to COMM-03, DAEMON-01 to DAEMON-04, Phase 3: STOR-01, STOR-02, LIST-01 to LIST-05, Phase 4: GELF-01 to GELF-05, Phase 5: PG-01 to PG-07, PG-COMM-01 to PG-COMM-04)
- Remaining: 14

## Current Phase

**Phase 6: Query Interface & Visualization** ◆ IN PROGRESS

**Goal:** Users can search, filter, and visualize collected profiling data

**Status:** In Progress - 2 of 4 plans complete (Wave 1)

**Progress:**
- ✅ Plan 06-01: Search API with cursor pagination (filter by project, URL, duration, timestamps, source)
- ✅ Plan 06-02: Web Dashboard HTML Foundation (Pico CSS, vanilla JavaScript, static serving)
- ⬜ Plan 06-03: TBD
- ⬜ Plan 06-04: TBD

**Requirements Delivered So Far:**
- ✅ QUERY-01: Web UI for searching/viewing profiling data
- ✅ Cursor-based pagination for efficient large result sets
- ✅ Filter by project, URL pattern, duration, timestamps, source

**Next plan:** 06-03 (Wave 1 continuation)

## Active Work

**Phase 6 Wave 1 IN PROGRESS** - Building query interface and web dashboard

**Completed:**
- Plan 06-01: Search API with cursor pagination
- Plan 06-02: Web Dashboard HTML Foundation

**Next:** Continue Phase 6 Wave 1 execution

## Blockers/Concerns

None - Phase 5 complete. Ready to begin Phase 6 (Query Interface & Visualization) or Phase 7 (Configuration & Deployment).

## Recent Activity

- 2026-01-28: Completed plan 06-02 - Web Dashboard HTML Foundation (3 tasks, 2min 40sec)
- 2026-01-28: Completed plan 06-01 - Search API with Cursor Pagination (3 tasks, 2min 24sec)
- 2026-01-28: **🎉 PHASE 5 COMPLETE** - Postgres Agent Database Monitoring (4/4 plans, 11 requirements)
- 2026-01-28: Completed plan 05-04 - Daemon and Systemd Service (3 tasks, 2min 13sec)
- 2026-01-28: Completed plan 05-03 - Log Parser and Transmission Layer (4 tasks, 2min 9sec)
- 2026-01-28: Completed plan 05-02 - Data Collectors (3 tasks, 2min 20sec)
- 2026-01-28: Completed plan 05-01 - Postgres Agent Foundation (3 tasks, 1min 56sec)
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
| Pico CSS over Tailwind or custom CSS | Semantic HTML styling (11KB), no build step, accessible by default, faster development | 06-02 | 2026-01-28 |
| Vanilla JavaScript over React/Vue | No build tooling, faster load time, sufficient for CRUD interface, easier debugging | 06-02 | 2026-01-28 |
| State management with module-scoped object | Simple pattern for single-page app, no external library needed, easy to debug | 06-02 | 2026-01-28 |
| Static file serving with Bun.file | Bun native file serving fast, proper content-type headers, no bundler needed | 06-02 | 2026-01-28 |
| DOM element caching in init() | Prevents repeated querySelector calls, improves performance, cleaner code | 06-02 | 2026-01-28 |
| Structured JSON logging via structlog | JSON format enables log parsing in Graylog/ELK, ISO timestamps for correlation, structured fields queryable | 05-04 | 2026-01-28 |
| Flush remaining logs on shutdown | Prevents losing log entries during graceful shutdown, 30s timeout allows completion | 05-04 | 2026-01-28 |
| Config path from argv or environment | Command-line for local testing, env var for systemd, explicit argv takes precedence | 05-04 | 2026-01-28 |
| Security hardening with minimal filesystem access | NoNewPrivileges, ProtectSystem=strict, ReadOnlyPaths for logs, limited ReadWritePaths reduces blast radius | 05-04 | 2026-01-28 |
| systemd resource limits (256MB memory, 25% CPU, 10 tasks) | Defense in depth with config limits, systemd enforcement works even if Python code has bugs | 05-04 | 2026-01-28 |
| Separate sends for each data type | Circuit breaker state can change mid-cycle, per-source-type failure tracking, listener handles partial data | 05-04 | 2026-01-28 |
| Background daemon thread for log parsing | Daemon thread exits automatically, dedicated 0.1s poll without blocking 60s collection cycle | 05-04 | 2026-01-28 |
| Collection loop with interruptible sleep | shutdown_event.wait() returns immediately on signal, enables fast shutdown, maintains accurate timing | 05-04 | 2026-01-28 |
| Buffer eviction targets 80% of max size | Provides headroom for new data without immediate re-eviction, FIFO prioritizes recent data | 05-03 | 2026-01-28 |
| flush_buffer checks circuit before and during processing | Stops flushing if circuit opens, avoids wasting resources on failing requests | 05-03 | 2026-01-28 |
| Circuit breaker 5 failures, 60s reset (Postgres agent) | Matches PHP daemon circuit breaker for consistency across agents | 05-03 | 2026-01-28 |
| Multi-line log entry buffering until next timestamp | PostgreSQL stack traces and long queries span multiple lines, timestamp marks entry boundary | 05-03 | 2026-01-28 |
| Log rotation detection via inode tracking | Robust across logrotate, copytruncate, rename patterns without false positives | 05-03 | 2026-01-28 |
| Query truncation at 1000 chars (pg_stat_statements) and 500 chars (locks) | Prevents payload bloat in transmission to central listener | 05-02 | 2026-01-28 |
| Connection pool cap at 5 connections | Monitoring must not overwhelm database (PG-07), enforced in config loader | 05-01 | 2026-01-28 |
| Statement timeout 5 seconds at connection level | Prevents hung queries from exhausting pool, set via connection options | 05-01 | 2026-01-28 |
| Environment variables override INI files | Standard 12-factor pattern, enables systemd/container overrides | 05-01 | 2026-01-28 |
| Application name 'bitville-monitor' | Enables identification in pg_stat_activity for tracking and debugging | 05-01 | 2026-01-28 |
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

Last activity: 2026-01-28T10:46:57Z - Completed 06-02-PLAN.md (Web Dashboard HTML Foundation)
