# Project State: Bitville APM & Centralized Logging

**Project:** Bitville APM & Centralized Logging System
**Current Milestone:** v1.0 - Initial Release
**Status:** Phase 1 Complete - Ready for Phase 2

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-27)

**Core value:** Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average

**Current focus:** Phase 2 - PHP Agent Daemon Architecture & Lifecycle

## Phase Progress

| Phase | Status | Plans | Progress | Commits |
|-------|--------|-------|----------|---------|
| 1 - PHP Agent Core Instrumentation & Safety | ✓ Complete | 6/6 | 100% | a2b8ae0, 713bf51, 980bb51, def8a37 |
| 2 - PHP Agent Daemon Architecture & Lifecycle | ○ Pending | 0/? | 0% | - |
| 3 - Central Listener Data Reception & Storage | ○ Pending | 0/? | 0% | - |
| 4 - Graylog Integration & Forwarding | ○ Pending | 0/? | 0% | - |
| 5 - Postgres Agent Database Monitoring | ○ Pending | 0/? | 0% | - |
| 6 - Query Interface & Visualization | ○ Pending | 0/? | 0% | - |
| 7 - Configuration & Deployment | ○ Pending | 0/? | 0% | - |

**Legend:** ○ Pending | ◆ In Progress | ✓ Complete

**Phase 1 Progress:** ████████████████████████████████████████████████████████████████████████████████████████████ 100% (6/6 plans)

## Milestone Overview

**Total phases:** 7
**Completed:** 1
**In progress:** 0
**Remaining:** 6

**Requirements coverage:**
- Total v1 requirements: 48
- Completed: 11 (Phase 1: PHP-01 to PHP-08, COMM-01 to COMM-03)
- Remaining: 37

## Current Phase

**Phase 2: PHP Agent Daemon Architecture & Lifecycle**

**Goal:** Background daemon processes buffered profiling data and forwards to central listener

**Status:** Pending - awaiting phase planning

**Phase 1 (COMPLETE):** PHP Agent Core Instrumentation & Safety
- ✅ All 11 requirements delivered (PHP-01 to PHP-08, COMM-01 to COMM-03)
- ✅ All 6 plans complete:
  - Plan 01-01: Configuration & Correlation Foundation
  - Plan 01-02: XHProf Integration
  - Plan 01-03: SQL Capture Module
  - Plan 01-04: Socket Transmission Layer
  - Plan 01-05: Request Metadata Collector
  - Plan 01-06: listener.php Orchestration

**Next step:** Plan Phase 2 activities

## Active Work

Phase 1 complete. Ready for Phase 2 planning.

## Blockers/Concerns

None currently.

## Recent Activity

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

Last activity: 2026-01-27T17:50:18Z - **Phase 1 Complete** (listener.php Orchestration)
