# Project State: Bitville APM & Centralized Logging

**Project:** Bitville APM & Centralized Logging System
**Current Milestone:** v1.0 - Initial Release
**Status:** Planning Complete - Ready for Phase 1

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-27)

**Core value:** Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average

**Current focus:** Phase 1 - PHP Agent Core Instrumentation & Safety

## Phase Progress

| Phase | Status | Plans | Progress | Commits |
|-------|--------|-------|----------|---------|
| 1 - PHP Agent Core Instrumentation & Safety | ◆ In Progress | 5/6 | 83% | c56ca2c, b6df167, def8a37 |
| 2 - PHP Agent Daemon Architecture & Lifecycle | ○ Pending | 0/? | 0% | - |
| 3 - Central Listener Data Reception & Storage | ○ Pending | 0/? | 0% | - |
| 4 - Graylog Integration & Forwarding | ○ Pending | 0/? | 0% | - |
| 5 - Postgres Agent Database Monitoring | ○ Pending | 0/? | 0% | - |
| 6 - Query Interface & Visualization | ○ Pending | 0/? | 0% | - |
| 7 - Configuration & Deployment | ○ Pending | 0/? | 0% | - |

**Legend:** ○ Pending | ◆ In Progress | ✓ Complete

**Phase 1 Progress:** ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█████████████████████████████████████████████████████████ 83% (5/6 plans)

## Milestone Overview

**Total phases:** 7
**Completed:** 0
**In progress:** 0
**Remaining:** 7

**Requirements coverage:**
- Total v1 requirements: 48
- Completed: 0
- Remaining: 48

## Current Phase

**Phase 1: PHP Agent Core Instrumentation & Safety**

**Goal:** Users can capture profiling data for slow PHP requests without impacting application stability

**Requirements:** 11 requirements (PHP-01 to PHP-08, COMM-01 to COMM-03)

**Progress:** 5/6 plans complete (83%)

**Completed:**
- ✅ Plan 01-01: Configuration & Correlation Foundation
- ✅ Plan 01-02: XHProf Integration
- ✅ Plan 01-03: SQL Capture Module
- ✅ Plan 01-04: Socket Transmission Layer
- ✅ Plan 01-05: Request Metadata Collector

**Next step:** Execute plan 01-06 (Integration layer)

## Active Work

Phase 1 in progress - executing plans sequentially.

## Blockers/Concerns

None currently.

## Recent Activity

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

Last activity: 2026-01-27T17:25:15Z - Completed plan 01-02 (XHProf Integration)
