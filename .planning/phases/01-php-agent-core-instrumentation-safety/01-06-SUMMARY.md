---
phase: 01-php-agent-core-instrumentation-safety
plan: 06
subsystem: orchestration
tags: [php, integration, listener, orchestration, shutdown-function, error-handling]

# Dependency graph
requires:
  - phase: 01-01
    provides: Configuration loader and correlation ID generator
  - phase: 01-02
    provides: XHProf integration
  - phase: 01-03
    provides: SQL capture module
  - phase: 01-04
    provides: Socket transmission layer
  - phase: 01-05
    provides: Request metadata collector
provides:
  - Main listener.php entry point for application integration
  - Complete profiler orchestration with shutdown function
  - Helper functions for application use (correlation ID, custom context)
  - Fatal error capture in profiling payload
  - Project identifier configuration
affects: [02-daemon, listener-server, production-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Shutdown function for end-of-request collection
    - Global state for profiler components
    - Helper functions for application integration
    - Complete error wrapping (try-catch at init and shutdown)
    - Custom context support for user-defined metadata
    - Fatal error detection via error_get_last()

key-files:
  created:
    - php-agent/profiling/listener.php
  modified: []

key-decisions:
  - "BITVILLE_APM_PROJECT constant for manual project identification"
  - "Shutdown function with set_time_limit(0) to prevent timeout during collection"
  - "Global variables for component storage (__bitville_apm_correlation_id, __bitville_apm_sql_collector)"
  - "Helper functions for application integration (bitville_apm_correlation_id, bitville_apm_add_context)"
  - "Fatal error capture via error_get_last() in shutdown function"
  - "Complete try-catch wrapping at both init and shutdown levels"

patterns-established:
  - "Orchestration pattern: Include-time initialization, shutdown-time collection"
  - "Helper function pattern: Prefixed with bitville_apm_* for namespace safety"
  - "Error safety pattern: Try-catch at every boundary, log and continue"
  - "Integration pattern: bitville_apm_attach_sql() called after DI initialization"

# Metrics
duration: 21min
completed: 2026-01-27
---

# Phase 01 Plan 06: listener.php Orchestration Summary

**Complete PHP profiler orchestration with shutdown-based collection, helper functions for application integration, and comprehensive error safety wrapping**

## Performance

- **Duration:** 21 minutes (includes checkpoint verification)
- **Started:** 2026-01-27T17:29:22Z
- **Completed:** 2026-01-27T17:50:18Z
- **Tasks:** 2 (plus checkpoint)
- **Files created:** 1

## Accomplishments

- Main listener.php entry point orchestrates all profiling components (config, correlation, XHProf, SQL, request, transmitter)
- Shutdown function collects and transmits data only for requests exceeding threshold
- Helper functions for application use: correlation ID, SQL comments, custom context, active status check
- Complete profiling payload with request, response, timing, XHProf, SQL, server metadata, and custom context
- Fatal error detection and capture in payload
- Integration documentation with example code for index.php integration
- All code wrapped in try-catch at both initialization and shutdown levels
- 295-line orchestration file with comprehensive safety

## Task Commits

Each task was committed atomically:

1. **Tasks 1-2: Create listener.php main orchestration file with helper functions** - `a2b8ae0` (feat)

_Note: Tasks 1 and 2 were combined in a single commit as they form a cohesive unit (main file + helpers)_

## Files Created/Modified

**Created:**
- `php-agent/profiling/listener.php` - Main profiler entry point with orchestration (295 lines)
  - Includes all profiling components at load time
  - Generates correlation ID and starts timing immediately
  - Registers shutdown function for end-of-request collection
  - Provides bitville_apm_attach_sql() for SQL collector attachment
  - Provides helper functions: bitville_apm_correlation_id(), bitville_apm_sql_comment(), bitville_apm_add_context(), bitville_apm_is_active()
  - Builds complete profiling payload with all metadata
  - Captures fatal errors via error_get_last()
  - Comprehensive integration documentation as comments

**Modified:**
- None

## Decisions Made

None - plan executed exactly as written.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Checkpoint Verification

**Checkpoint reached:** Task 3 (human-verify)

**User approval:** Approved

**Verification performed:** Profiler integration confirmed working:
- ✅ listener.php loads without errors
- ✅ Correlation ID generated (UUID v4 format)
- ✅ Helper functions return expected values
- ✅ Shutdown function executes and collects data
- ✅ Threshold check prevents transmission for fast requests
- ✅ All error handling prevents application impact

## Requirements Coverage

This plan completes all Phase 01 requirements:

- ✅ **PHP-01:** Capture profiling data only for requests exceeding 500ms threshold (via should_profile() in shutdown)
- ✅ **PHP-02:** Generate unique correlation ID (UUID v4) at request start (via generate_correlation_id())
- ✅ **PHP-03:** Integrate XHProf for function-level timing breakdown (via xhprof_start() and xhprof_collect_all())
- ✅ **PHP-04:** Collect request metadata (via collect_all_request_data())
- ✅ **PHP-05:** Collect memory usage (via xhprof_collector.php memory stats)
- ✅ **PHP-06:** Capture all SQL queries with timing (via SqlCollector)
- ✅ **PHP-07:** Configurable toggles via settings file (via get_profiling_config())
- ✅ **PHP-08:** Project identifier injection (via BITVILLE_APM_PROJECT constant)
- ✅ **COMM-01:** Send data within 50ms timeout (via send_profiling_data())
- ✅ **COMM-02:** Non-blocking sockets with SO_SNDTIMEO (via transmitter.php)
- ✅ **COMM-03:** Skip silently if listener unreachable (via disk buffer fallback)

## Integration Instructions

**For production deployment:**

1. **Include in index.php:**
   ```php
   // At the very top of /var/www/project/site/public/index.php
   require_once dirname(__DIR__) . '/profiling/listener.php';
   ```

2. **Attach SQL collector after DI initialization:**
   ```php
   // After $di is initialized but before any database queries
   if (function_exists('bitville_apm_attach_sql')) {
       bitville_apm_attach_sql($di);
   }
   ```

3. **Update project identifier:**
   - Edit BITVILLE_APM_PROJECT constant in listener.php
   - Set to unique project name (e.g., 'myproject', 'api-v2', 'admin-panel')

4. **Configure profiling:**
   - Edit /etc/bitville-apm/profiling.ini
   - Set threshold_ms, enable/disable features

5. **Optional - Add custom context:**
   ```php
   // In your application code
   bitville_apm_add_context('user_id', $user->id);
   bitville_apm_add_context('route', $router->getMatchedRoute()->getName());
   ```

## Next Phase Readiness

**Phase 1 Complete - All requirements delivered:**
- ✅ Configuration system with static caching (01-01)
- ✅ XHProf integration with noise filtering (01-02)
- ✅ SQL capture with Phalcon event hooks (01-03)
- ✅ Socket transmission with 50ms timeout and disk buffer (01-04)
- ✅ Request metadata collector with sensitive data filtering (01-05)
- ✅ Main listener.php orchestration file (01-06)

**Ready for Phase 2:**
- ✅ PHP agent produces complete profiling payloads
- ✅ Integration pattern defined (include listener.php, attach SQL)
- ✅ Error safety guarantees no application impact
- ✅ Helper functions available for application use

**Phase 2 next steps:**
- Build daemon to read buffered profiling data from disk
- Implement daemon lifecycle (start, stop, restart, status)
- Forward data to central listener over network
- Add daemon logging and error recovery

**No blockers or concerns.**

---
*Phase: 01-php-agent-core-instrumentation-safety*
*Completed: 2026-01-27*
