---
phase: 04-graylog-integration
plan: 02
subsystem: integration
tags: [graylog, gelf, circuit-breaker, opossum, tcp, resilience]

# Dependency graph
requires:
  - phase: 04-01
    provides: GELF client module, forwarded_to_graylog tracking column, replay query functions
provides:
  - Circuit breaker wrapping GELF send with opossum library
  - State persistence to disk for circuit breaker (survives restarts)
  - Forwarder module that builds GELF messages and sends through circuit breaker
  - GELF message mapping with all required fields (correlation_id, project, source, duration_ms)
affects: [04-03-replay-integration, listener-ingestion-handlers]

# Tech tracking
tech-stack:
  added: [opossum@9.0.0, @types/opossum@8.1.9]
  patterns: [circuit-breaker-pattern, state-persistence, fire-and-forget-forwarding, fail-fast-on-circuit-open]

key-files:
  created:
    - listener/src/graylog/state.ts
    - listener/src/graylog/circuit-breaker.ts
    - listener/src/graylog/forwarder.ts
  modified: []

key-decisions:
  - "Circuit breaker opens after 5 consecutive failures with volume threshold 5"
  - "Circuit breaker retry timeout is 60 seconds (matches Phase 2 PHP agent)"
  - "State persists to disk at BITVILLE_STATE_PATH (default: /var/lib/bitville/circuit-breaker-state.json)"
  - "Recovery callback triggers replay when circuit closes (via setImmediate)"
  - "GELF messages extract request context (_url, _method, _status_code) from payload"
  - "forwardToGraylog uses fire-and-forget pattern with fail-fast when circuit open"

patterns-established:
  - "Circuit breaker state persistence: load on init, save on state transitions (open/close/halfOpen)"
  - "GELF message building: extract nested payload fields to underscore-prefixed custom fields"
  - "Graceful database handling: try-catch for markAsForwarded in disabled mode (test compatibility)"

# Metrics
duration: 2min 57sec
completed: 2026-01-27
---

# Phase 04 Plan 02: Circuit Breaker and Forwarder Module Summary

**Opossum circuit breaker with disk state persistence wrapping GELF TCP send, forwarder building GELF messages with correlation_id, project, source, and extracted request context**

## Performance

- **Duration:** 2 min 57 sec
- **Started:** 2026-01-27T21:18:01Z
- **Completed:** 2026-01-27T21:20:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Circuit breaker wraps GELF send with 5 consecutive failure threshold and 60s retry timeout
- Circuit breaker state persists to disk and survives listener restarts
- Recovery callback triggers replay when circuit transitions to closed
- Forwarder builds GELF messages with all required fields and extracted payload context
- Fail-fast pattern: forwardToGraylog returns immediately when circuit is open

## Task Commits

Each task was committed atomically:

1. **Task 1: Create circuit breaker with state persistence** - `333e848` (feat)
2. **Task 2: Create forwarder module with GELF message building** - `1f069a7` (feat)

## Files Created/Modified
- `listener/src/graylog/state.ts` - Circuit breaker state persistence (load/save JSON to disk)
- `listener/src/graylog/circuit-breaker.ts` - Opossum circuit breaker wrapping sendGelfMessage
- `listener/src/graylog/forwarder.ts` - Main forwarding logic with GELF message building

## Decisions Made

**Circuit breaker configuration:**
- Volume threshold 5 (need 5 requests before calculating failure percentage)
- Error threshold 50% (opens after 50% failures within volume window)
- Reset timeout 60 seconds (retry after 60s in open state)
- Timeout 5 seconds per send (matches client.ts timeout)

**State persistence strategy:**
- Load persisted state on initialization
- Restore OPEN state only if less than 60s elapsed since last state change
- Save state on every state transition (open/close/halfOpen)
- Non-fatal: continue operating if state save fails

**GELF message mapping:**
- Standard fields: version, host, short_message, timestamp, level, full_message
- Core custom fields: _correlation_id, _project, _source, _row_id, _duration_ms
- Extracted request context: _url (truncated to 500 chars), _method, _status_code
- Extracted SQL summary: _sql_queries, _sql_duration_ms
- Extracted memory: _memory_peak_mb
- Extracted server: _server_hostname

**Recovery callback design:**
- Registered during circuit breaker creation
- Triggered via setImmediate when circuit closes (non-blocking)
- Will be used by replay module (plan 04-03) to process buffered records

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added try-catch for markAsForwarded when Graylog disabled**
- **Found during:** Task 2 (testing forwarder)
- **Issue:** When Graylog is disabled, forwardToGraylog tries to mark record as forwarded, but database may not be initialized (e.g., in isolated tests)
- **Fix:** Added try-catch around markAsForwarded call in disabled path to handle missing database gracefully
- **Files modified:** listener/src/graylog/forwarder.ts
- **Verification:** test-forwarder.ts runs successfully without database
- **Committed in:** 1f069a7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix necessary for test compatibility and graceful degradation. No scope creep.

## Issues Encountered
None - both tasks executed as planned.

## Verification Performed

1. Circuit breaker initialization verified via test-circuit-breaker.ts
2. State persistence verified (load returns null for fresh start)
3. Circuit breaker status API returns correct state and stats
4. GELF message building verified with test record
5. All required fields present in GELF message (_correlation_id, _project, _source, _duration_ms)
6. Extracted fields verified (_url, _method, _status_code, _sql_queries, _sql_duration_ms, _server_hostname)
7. TypeScript compilation successful with bun build --target=bun

## Next Phase Readiness

**Ready for Plan 04-03 (Replay Integration):**
- Circuit breaker exposes recovery callback mechanism
- getUnforwardedRecords() available from queries.ts
- markAsForwarded() available to update records after successful replay
- forwardToGraylog() handles individual record forwarding

**Blockers:** None

**Next steps:**
- Plan 04-03: Implement replay worker that triggers on circuit recovery
- Integration into ingestion handlers (HTTP/UDP) to call forwardInsertedData()

---
*Phase: 04-graylog-integration-a-forwarding*
*Completed: 2026-01-27*
