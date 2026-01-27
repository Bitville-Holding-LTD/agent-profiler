---
phase: 02-php-agent-daemon-architecture-a-lifecycle
plan: 02
subsystem: daemon-buffering
tags: [php, buffer, disk-overflow, atomic-writes, fifo]

# Dependency graph
requires:
  - phase: 02-01
    provides: Daemon foundation with ReactPHP event loop and worker lifecycle
provides:
  - Memory buffer with configurable size limit (default 100 items)
  - Automatic disk overflow using atomic writes (tempnam + rename)
  - FIFO disk buffer replay on daemon startup
  - Buffer flush on graceful shutdown and worker restart
affects: [02-03, 02-04, circuit-breaker, data-persistence]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Atomic disk writes (tempnam + rename)", "Memory buffer with disk overflow", "FIFO replay pattern"]

key-files:
  created: [php-agent/daemon/buffer_manager.php]
  modified: [php-agent/daemon/daemon.php]

key-decisions:
  - "Memory buffer limit: 100 items (default, configurable)"
  - "Disk buffer location: /var/lib/bitville-apm/buffer (configurable)"
  - "Atomic writes using tempnam + rename for partial write protection"
  - "FIFO replay on startup to recover buffered data from previous run"
  - "Flush to disk on SIGTERM and worker restart prevents data loss"

patterns-established:
  - "BufferManager: Memory-first with disk overflow pattern for reliable data buffering"
  - "Replay on startup: Restore buffered state after daemon restart"
  - "Safe error handling: Never throw exceptions, always log and degrade gracefully"

# Metrics
duration: 1min 58sec
completed: 2026-01-27
---

# Phase 2 Plan 2: Buffer Management Summary

**Memory buffer with automatic disk overflow using atomic writes, FIFO replay on startup, and graceful flush on shutdown**

## Performance

- **Duration:** 1 min 58 sec
- **Started:** 2026-01-27T18:24:50Z
- **Completed:** 2026-01-27T18:26:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- BufferManager class holds profiling data in memory with automatic disk overflow
- Atomic disk writes using tempnam + rename pattern prevent partial writes
- FIFO replay of disk buffer on daemon startup recovers data from previous run
- Buffer flush on graceful shutdown (SIGTERM) and worker restart prevents data loss
- Statistics tracking for memory buffer count, disk overflow count, and file count

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BufferManager class with memory buffer and disk overflow** - `022b19f` (feat)
2. **Task 2: Integrate BufferManager into daemon.php** - `3abb8ef` (feat)

## Files Created/Modified
- `php-agent/daemon/buffer_manager.php` - Memory buffer with disk overflow, FIFO replay, and statistics
- `php-agent/daemon/daemon.php` - Integrated BufferManager for all incoming profiling data, flush on shutdown/restart, replay on startup

## Decisions Made

1. **Memory buffer limit: 100 items (default)**
   - Configurable via DAEMON_BUFFER_LIMIT constant
   - Balances memory usage with disk I/O frequency

2. **Disk buffer path: /var/lib/bitville-apm/buffer**
   - Configurable via DAEMON_BUFFER_PATH constant
   - Separate from runtime directory for persistence across restarts

3. **Atomic writes using tempnam + rename**
   - Same pattern as Phase 1 transmitter (01-04)
   - Prevents partial writes if daemon crashes during disk flush

4. **FIFO replay on startup**
   - Reads disk buffer files in sorted order (timestamp-based filenames)
   - Re-adds items to memory buffer for processing by circuit breaker (Plan 02-03)
   - Deletes files after successful replay

5. **Flush to disk on SIGTERM and worker restart**
   - Prevents data loss during graceful shutdown
   - Worker restarts (memory/request limits) also flush before exit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

Ready for Plan 02-03 (Circuit Breaker & Forward Transmission):
- BufferManager provides `flush()` method to get buffered items for transmission
- Buffer statistics available via `getStats()` for monitoring
- Disk overflow automatically handles backpressure when central listener unavailable

Note: BufferManager is integrated but not yet transmitting. Plan 02-03 will implement CircuitBreaker to forward buffered data to central listener.

---
*Phase: 02-php-agent-daemon-architecture-a-lifecycle*
*Completed: 2026-01-27*
