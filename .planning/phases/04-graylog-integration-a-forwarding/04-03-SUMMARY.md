---
phase: 04-graylog-integration-a-forwarding
plan: 03
subsystem: observability
tags: [graylog, gelf, circuit-breaker, replay, forwarding, async]

# Dependency graph
requires:
  - phase: 04-02
    provides: Circuit breaker with state persistence and GELF message builder
  - phase: 04-01
    provides: Database tracking column and GELF client for Graylog communication
provides:
  - FIFO replay mechanism for buffered records during Graylog outages
  - Fire-and-forget forwarding integrated into all ingestion endpoints
  - Server startup initialization of Graylog integration
  - Health endpoint diagnostics for Graylog status and replay state
affects: [05-postgres-agent, 06-query-interface]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget async forwarding, batch replay with circuit awareness]

key-files:
  created:
    - listener/src/graylog/replay.ts
  modified:
    - listener/src/handlers/php-agent.ts
    - listener/src/handlers/postgres-agent.ts
    - listener/src/handlers/udp-receiver.ts
    - listener/src/server.ts

key-decisions:
  - "Batch size 100 with 100ms delay prevents overwhelming Graylog during replay"
  - "Circuit breaker checks between batches and records enable clean replay interruption"
  - "Fire-and-forget pattern with .catch() ensures forwarding never blocks ingestion"
  - "Recovery callback uses replayUnforwardedRecords() to automatically process buffered data"

patterns-established:
  - "Fire-and-forget async pattern: call forwardInsertedData().catch() without await"
  - "Graceful replay interruption: check circuit breaker state in outer and inner loops"
  - "Health diagnostics: /ready endpoint includes graylog, circuitBreaker, and replay objects"

# Metrics
duration: 4min
completed: 2026-01-27
---

# Phase 4 Plan 3: Replay Integration and Handler Wiring Summary

**Fire-and-forget Graylog forwarding wired into all ingestion endpoints with FIFO replay of buffered records on circuit breaker recovery**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-01-27T21:25:08Z
- **Completed:** 2026-01-27T21:29:10Z
- **Tasks:** 4 (3 automated + 1 human verification checkpoint)
- **Files modified:** 5

## Accomplishments

- FIFO replay mechanism processes buffered records in batches when Graylog recovers
- All three ingestion endpoints (PHP agent, Postgres agent, UDP receiver) forward data to Graylog asynchronously
- Server initialization creates circuit breaker with replay callback
- Health endpoint includes comprehensive Graylog status (enabled state, circuit breaker state, replay stats)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create replay mechanism** - `ba41f49` (feat)
   - Implements replayUnforwardedRecords with batch processing (100 records per batch, 100ms delay)
   - Circuit breaker awareness: stops cleanly if circuit opens mid-replay
   - Status tracking with getReplayStatus for health checks

2. **Task 2: Wire forwarding into handlers** - `9541cef` (feat)
   - PHP agent handler: forwardInsertedData after insert with fire-and-forget pattern
   - Postgres agent handler: forwardInsertedData after insert with fire-and-forget pattern
   - UDP receiver: forwardInsertedData for both PHP and Postgres data types
   - All handlers use .catch() without await to prevent blocking responses

3. **Task 3: Initialize Graylog in server** - `573031b` (feat)
   - Server startup initializes GELF client
   - Creates circuit breaker with replay callback when Graylog enabled
   - Enhanced /ready endpoint with graylog, circuitBreaker, and replay status objects
   - Startup logs show Graylog forwarding destination

4. **Task 4: Human verification checkpoint** - User approved

**Plan metadata:** *(will be committed with this SUMMARY)*

## Files Created/Modified

- `listener/src/graylog/replay.ts` - FIFO replay mechanism with circuit breaker awareness
- `listener/src/handlers/php-agent.ts` - Added forwardInsertedData call after insert
- `listener/src/handlers/postgres-agent.ts` - Added forwardInsertedData call after insert
- `listener/src/handlers/udp-receiver.ts` - Added forwardInsertedData calls for both data types
- `listener/src/server.ts` - Graylog initialization with circuit breaker and replay callback

## Decisions Made

1. **Batch size 100 with 100ms delay:** Prevents overwhelming Graylog during replay while still processing quickly
2. **Circuit breaker checks in outer and inner loops:** Enables clean interruption at batch boundaries or mid-batch
3. **Fire-and-forget pattern with .catch():** Ensures forwarding errors are logged but never block ingestion responses
4. **Recovery callback triggers replay automatically:** When circuit breaker closes, replay starts immediately via callback

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without issues. User verification checkpoint approved without changes required.

## User Setup Required

None - no external service configuration required in this plan. Graylog server configuration was handled in previous plans (04-01 user setup for GRAYLOG_HOST/PORT environment variables).

## Next Phase Readiness

**Phase 4 Complete** - All Graylog integration requirements delivered:

- ✅ GELF-01: All data forwarded to Graylog (fire-and-forget pattern in handlers)
- ✅ GELF-02: GELF TCP transport (gelf-pro library)
- ✅ GELF-03: Circuit breaker (opossum with 5 failures, 60s retry)
- ✅ GELF-04: SQLite buffering + replay (forwarded_to_graylog column + replay.ts)
- ✅ GELF-05: Project identifier included (_project field in GELF messages)

**Ready for Phase 5:** Postgres agent database monitoring can now build on the complete centralized logging infrastructure. All profiling data flows through the listener and forwards to Graylog with resilient buffering.

**No blockers or concerns** - Integration is feature-complete and tested.

---
*Phase: 04-graylog-integration-a-forwarding*
*Completed: 2026-01-27*
