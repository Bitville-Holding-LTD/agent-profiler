---
phase: 02-php-agent-daemon-architecture-a-lifecycle
plan: 01
subsystem: daemon
tags: [php, reactphp, event-loop, unix-socket, worker-lifecycle, signal-handling, async]

# Dependency graph
requires:
  - phase: 01-php-agent-core-instrumentation-and-safety
    provides: Profiling data transmission via Unix socket (transmitter.php)
provides:
  - ReactPHP-based daemon foundation with event loop
  - Unix domain socket server for receiving profiling data
  - Worker lifecycle management (memory/request limits, GC)
  - Signal handling (SIGTERM, SIGHUP) for graceful shutdown
  - Foundation for buffer management (Plan 02-02)
affects: [02-02, 02-03, 02-04, daemon-operations, deployment]

# Tech tracking
tech-stack:
  added:
    - react/socket (v1.17.0) - Async Unix socket server
    - react/event-loop (v1.6.0) - Event loop for async operations
    - composer.phar - Dependency management
  patterns:
    - ReactPHP event loop for long-running daemon processes
    - Periodic timers for health monitoring and stats logging
    - Worker lifecycle pattern (restart on resource limits)
    - Safe error handling (no exceptions crash daemon)

key-files:
  created:
    - php-agent/daemon/daemon.php - Main daemon entry point
    - php-agent/daemon/socket_server.php - Unix socket server wrapper
    - php-agent/daemon/worker_lifecycle.php - Health monitoring and GC
    - php-agent/composer.json - Dependency manifest
  modified: []

key-decisions:
  - "ReactPHP event loop for async operation (industry-standard for PHP daemons)"
  - "SOCK_STREAM sockets for ReactPHP (SOCK_DGRAM used in Phase 1 will be bridged in Plan 02-04)"
  - "Worker restart at 256MB memory or 1000 requests (prevents memory leaks in long-running process)"
  - "Garbage collection every 100 requests (balance between overhead and memory management)"
  - "SIGTERM for graceful shutdown, SIGHUP for reload (standard Unix daemon signals)"
  - "Periodic timer checks every 1s for shutdown/restart (responsive without tight loop)"
  - "Stats logging every 60s (operational visibility without spam)"

patterns-established:
  - "Safe method pattern: all public methods wrapped in try-catch, log errors but never throw"
  - "Lifecycle monitoring: track request count, memory usage, periodic GC"
  - "Signal-driven shutdown: pcntl_async_signals + flags checked in periodic timers"
  - "Placeholder pattern: stub implementations with TODO comments for next plan"

# Metrics
duration: 2min 50sec
completed: 2026-01-27
---

# Phase 2 Plan 1: Daemon Foundation Summary

**ReactPHP event loop daemon with Unix socket server, worker lifecycle management (256MB/1000req limits), signal handling, and periodic GC**

## Performance

- **Duration:** 2 min 50 sec
- **Started:** 2026-01-27T18:19:57Z
- **Completed:** 2026-01-27T18:22:47Z
- **Tasks:** 3
- **Files modified:** 4 created, 0 modified

## Accomplishments
- ReactPHP daemon foundation with event loop and async socket server
- Worker lifecycle management triggers restart at memory or request thresholds
- SIGTERM/SIGHUP signal handling for graceful shutdown and reload
- Periodic garbage collection (every 100 requests) with memory tracking
- Foundation ready for buffer management (Plan 02-02) and central listener forwarding (Plan 02-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WorkerLifecycle class** - `7928601` (feat)
2. **Task 2: Create SocketServer class** - `deee093` (feat)
3. **Task 3: Create main daemon.php entry point** - `0b74996` (feat)

## Files Created/Modified
- `php-agent/daemon/worker_lifecycle.php` - Monitors memory, request count, triggers GC every 100 requests, returns restart flag when thresholds exceeded
- `php-agent/daemon/socket_server.php` - ReactPHP UnixServer wrapper, newline-delimited JSON parsing, connection buffer management
- `php-agent/daemon/daemon.php` - Main entry point with event loop, signal handlers, periodic timers for shutdown checks and stats
- `php-agent/composer.json` - Dependencies: react/socket, react/event-loop

## Decisions Made

**1. ReactPHP for async daemon operation**
- **Rationale:** Industry standard for PHP long-running processes, mature event loop, proven in production
- **Impact:** Enables non-blocking socket I/O and efficient periodic timers

**2. SOCK_STREAM vs SOCK_DGRAM socket type**
- **Context:** Phase 1 transmitter.php uses SOCK_DGRAM (datagram), but ReactPHP requires SOCK_STREAM
- **Decision:** Create SOCK_STREAM server on /var/run/bitville-apm/daemon.sock
- **Plan 02-04 will:** Update listener.php to use dual sockets or stream socket for daemon communication
- **Rationale:** ReactPHP UnixServer only supports stream sockets

**3. Worker restart thresholds**
- **Memory limit:** 256MB (prevents memory leaks in long-running process)
- **Request limit:** 1000 requests per worker lifecycle
- **Rationale:** Balance between restart overhead and memory accumulation risk

**4. Garbage collection interval**
- **Frequency:** Every 100 requests
- **Rationale:** Aggressive enough to prevent buildup, infrequent enough to avoid GC overhead
- **Logging:** Reports cycles collected and memory freed for tuning

**5. Signal handling approach**
- **SIGTERM:** Graceful shutdown (flush buffers, close sockets, exit cleanly)
- **SIGHUP:** Reload configuration (not implemented yet, logged only)
- **Implementation:** pcntl_async_signals with flag checked in periodic timer
- **Rationale:** Standard Unix daemon signal conventions

**6. Periodic timer intervals**
- **Shutdown check:** Every 1 second (responsive without tight loop)
- **Stats logging:** Every 60 seconds (visibility without log spam)
- **Rationale:** Balance between responsiveness and CPU efficiency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Composer not installed**
- **Found during:** Task 2 (installing ReactPHP dependencies)
- **Issue:** composer command not found in PATH, blocking ReactPHP installation
- **Fix:** Downloaded and installed composer.phar locally via PHP installer script
- **Files added:** php-agent/composer.phar
- **Verification:** Successfully installed react/socket and react/event-loop
- **Committed in:** deee093 (Task 2 commit)

**2. [Rule 1 - Bug] PHP 8.5 nullable parameter deprecation**
- **Found during:** Task 2 verification (syntax check)
- **Issue:** "Implicitly marking parameter $onDataCallback as nullable is deprecated"
- **Fix:** Changed `callable $onDataCallback = null` to `?callable $onDataCallback = null`
- **Files modified:** php-agent/daemon/socket_server.php (line 30)
- **Verification:** Syntax check passes without warnings
- **Committed in:** deee093 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary to proceed. Composer installation is standard setup. Nullable fix prevents deprecation warnings in PHP 8.5.

## Issues Encountered

None - all tasks executed smoothly after dependency installation.

## User Setup Required

None - no external service configuration required. Daemon will run as systemd service in deployment (Phase 7).

## Next Phase Readiness

**Ready for Plan 02-02:** Buffer management implementation
- Daemon foundation complete with socket server and lifecycle management
- Placeholder callback in daemon.php ready to be replaced with buffer logic
- Worker lifecycle ready to track buffer statistics

**Ready for Plan 02-03:** Central listener forwarding
- Event loop established for async HTTP client operations
- Socket server can receive data while forwarding happens asynchronously

**Socket type consideration for Plan 02-04:**
- Phase 1 listener.php uses SOCK_DGRAM for transmission
- This daemon uses SOCK_STREAM (ReactPHP requirement)
- Plan 02-04 should update listener.php to use SOCK_STREAM socket for daemon communication
- Alternative: Bridge component that receives DGRAM and forwards to daemon's STREAM socket

**No blockers** - foundation is solid and extensible.

---
*Phase: 02-php-agent-daemon-architecture-a-lifecycle*
*Completed: 2026-01-27*
