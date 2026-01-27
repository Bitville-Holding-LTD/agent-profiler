---
phase: 02-php-agent-daemon-architecture-a-lifecycle
plan: 03
subsystem: daemon-resilience
tags: [circuit-breaker, http-client, failure-handling, curl, state-persistence]

# Dependency graph
requires:
  - phase: 02-01
    provides: Daemon foundation with ReactPHP event loop and Unix socket server
provides:
  - Circuit breaker pattern implementation with persistent state
  - HTTP transmitter for forwarding profiling data to central listener
  - Automatic failure tracking and circuit opening after threshold
  - Half-open state for automatic recovery testing
affects: [02-04-socket-protocol-bridge, 03-central-listener]

# Tech tracking
tech-stack:
  added: []
  patterns: [circuit-breaker-pattern, atomic-file-writes, state-persistence, http-post-forwarding]

key-files:
  created:
    - php-agent/daemon/circuit_breaker.php
    - php-agent/daemon/transmitter.php
  modified: []

key-decisions:
  - "Circuit breaker opens after 5 consecutive failures (configurable)"
  - "Circuit breaker retry timeout: 60 seconds (configurable)"
  - "State persists to disk using atomic writes (tempnam + rename)"
  - "HTTP transmission with 5-second timeout, 2-second connect timeout"
  - "Removed curl_close() to prevent PHP 8.0+ deprecation warnings"

patterns-established:
  - "Circuit breaker with three states: closed, open, half_open"
  - "Atomic file writes for state persistence (tempnam + rename)"
  - "Default circuit breaker instantiation if not provided to constructor"

# Metrics
duration: 2min
completed: 2026-01-27
---

# Phase 2 Plan 3: Circuit Breaker & Transmitter Summary

**Circuit breaker pattern with persistent state and HTTP transmitter for automatic profiling disable during central listener failures**

## Performance

- **Duration:** 2 minutes
- **Started:** 2026-01-27T18:24:53Z
- **Completed:** 2026-01-27T18:26:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Circuit breaker tracks consecutive failures and automatically opens after threshold
- State persists to disk across daemon restarts using atomic file writes
- HTTP transmitter forwards profiling data to central listener with circuit breaker integration
- Automatic recovery testing via half-open state after timeout

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CircuitBreaker class with persistent state** - `e7ea204` (feat)
2. **Task 2: Create DaemonTransmitter for forwarding to central listener** - `a3cae67` (feat)

## Files Created/Modified
- `php-agent/daemon/circuit_breaker.php` - Circuit breaker pattern with three states (closed/open/half_open), persistent state file, automatic recovery testing
- `php-agent/daemon/transmitter.php` - HTTP POST transmitter using cURL, circuit breaker integration, batch send support

## Decisions Made

**Circuit breaker thresholds:**
- Failure threshold: 5 consecutive failures (configurable)
- Retry timeout: 60 seconds (configurable)
- Rationale: Balance between sensitivity and false positives; matches research recommendations

**State persistence:**
- Atomic file writes using tempnam() + rename()
- State directory: /var/lib/bitville-apm/circuit-breaker-state
- Rationale: Prevents partial writes, state survives daemon restarts

**HTTP transmission:**
- 5-second total timeout, 2-second connect timeout
- Default endpoint: http://localhost:8080/api/profiling
- Rationale: Quick failure detection, configurable for Phase 3 central listener

**PHP 8.0+ compatibility:**
- Removed curl_close() call (deprecated/no-op in PHP 8.0+)
- Rationale: Prevent deprecation warnings while maintaining PHP 7.4 compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed curl_close() deprecation warning**
- **Found during:** Task 2 verification
- **Issue:** curl_close() deprecated in PHP 8.0+ (no-op since PHP 8.0), causing deprecation warnings in test output
- **Fix:** Removed curl_close() call with comment noting it's harmless for PHP 7.4 (target version)
- **Files modified:** php-agent/daemon/transmitter.php
- **Verification:** Test runs without deprecation warnings
- **Committed in:** a3cae67 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor fix to prevent deprecation warnings in newer PHP versions. No functional change, maintains PHP 7.4 compatibility.

## Issues Encountered

None - plan executed smoothly with clear implementation guidance.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 3 (Central Listener):**
- Circuit breaker prevents resource waste when listener unavailable
- Transmitter configured to send to http://localhost:8080/api/profiling (Phase 3 endpoint)
- State persistence ensures circuit breaker survives daemon restarts

**Integration note for Phase 2-04 (Socket Protocol Bridge):**
- Plan 02-01 daemon uses SOCK_STREAM (ReactPHP requirement)
- Plan 01-04 listener.php uses SOCK_DGRAM
- Plan 02-04 should bridge this socket type mismatch

**Blocker note:**
- Circuit breaker currently instantiated with default values in transmitter
- Future integration: daemon.php should create circuit breaker and pass to transmitter for shared state

---
*Phase: 02-php-agent-daemon-architecture-a-lifecycle*
*Completed: 2026-01-27*
