---
phase: 01-php-agent-core-instrumentation-safety
plan: 02
subsystem: profiling
tags: [php, xhprof, profiling, function-timing, hotspots, memory-tracking, performance]

# Dependency graph
requires:
  - phase: 01-01
    provides: Configuration loader (get_profiling_config)
provides:
  - XHProf wrapper functions (start/stop/collect)
  - Function-level timing with noise filtering
  - Hotspot identification (>5% threshold)
  - Memory tracking independent of XHProf
affects: [01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - XHProf integration with XHPROF_FLAGS_NO_BUILTINS only (minimal overhead)
    - Noise filtering (<1ms functions removed)
    - Hotspot identification (functions >threshold% of total time)
    - Memory tracking via PHP built-in functions (not XHProf flags)
    - Static flag tracking for profiling state

key-files:
  created:
    - php-agent/profiling/xhprof_collector.php
  modified: []

key-decisions:
  - "XHPROF_FLAGS_NO_BUILTINS only - no CPU or memory flags (avoid 200-300% overhead)"
  - "Noise filtering at 1ms threshold (removes functions <1ms total time)"
  - "Hotspot threshold at 5% of total time (configurable)"
  - "Memory tracking via memory_get_peak_usage() not XHPROF_FLAGS_MEMORY"
  - "Never throw exceptions - return false/null and log errors only"

patterns-established:
  - "XHProf pattern: Check extension, check config, enable with minimal flags"
  - "Data filtering pattern: Filter noise, sort by impact, calculate percentages"
  - "Hotspot pattern: Identify high-impact functions worth investigating"
  - "Error handling pattern: Try-catch, log errors, return safe fallbacks"

# Metrics
duration: 2min 22sec
completed: 2026-01-27
---

# Phase 01 Plan 02: XHProf Integration Summary

**Function-level profiling with XHProf using XHPROF_FLAGS_NO_BUILTINS, noise filtering (<1ms), hotspot identification (>5% threshold), and independent memory tracking**

## Performance

- **Duration:** 2 minutes 22 seconds
- **Started:** 2026-01-27T17:22:53Z
- **Completed:** 2026-01-27T17:25:15Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- XHProf wrapper with graceful degradation (returns false when extension missing)
- Function-level timing using XHPROF_FLAGS_NO_BUILTINS only (minimal overhead)
- Noise filtering removes functions with <1ms total time
- Hotspot identification finds functions consuming >5% of total time
- Memory tracking via PHP built-in functions (peak_usage, current_usage, peak_usage_no_real)
- Complete profiling package with xhprof_collect_all() convenience function
- Zero exceptions thrown under any condition (log errors only)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create XHProf wrapper with safe enable/disable** - `c56ca2c` (feat)
2. **Task 2: Add XHProf data filtering and summarization** - `b6df167` (feat)

## Files Created/Modified

**Created:**
- `php-agent/profiling/xhprof_collector.php` - XHProf integration with filtering, summarization, and memory tracking

**Modified:**
- None

## Decisions Made

**1. Use XHPROF_FLAGS_NO_BUILTINS only**
- Rationale: CPU and memory flags add 200-300% overhead, reducing PHP 7 to PHP 5.6 performance levels
- Impact: Minimal profiling overhead while capturing function timing
- Source: Research findings from longxinH/xhprof documentation

**2. Noise filtering at 1ms threshold**
- Rationale: Functions with <1ms total time are noise and clutter analysis
- Impact: Cleaner profiling data focused on impactful functions
- Configurable in xhprof_summarize() if needed

**3. Memory tracking via PHP functions, not XHProf**
- Rationale: XHPROF_FLAGS_MEMORY adds significant overhead
- Impact: Memory stats available without performance penalty
- Uses: memory_get_peak_usage(), memory_get_usage()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - XHProf extension is optional. If not installed, profiling gracefully returns false/null without errors.

## Next Phase Readiness

**Ready for next plans:**
- ✅ XHProf integration complete (Plan 01-03 can start/stop profiling)
- ✅ Data summarization ready (Plan 01-04 can collect formatted data)
- ✅ Memory tracking available (Plan 01-05 can include memory stats)

**Verification results:**
- Graceful degradation: xhprof_start() returns false when extension missing (no errors)
- xhprof_collect_all() returns null when not started (correct behavior)
- Noise filtering: Functions <1ms filtered correctly
- Sorting: Top functions sorted by wall time descending
- Memory tracking: Peak and current usage captured correctly
- Hotspot identification: Functions >5% of total time identified

**No blockers or concerns.**

**Note:** XHProf extension (longxinH/xhprof fork) should be installed on production servers where profiling is needed. Installation is optional - code works without it.

---
*Phase: 01-php-agent-core-instrumentation-safety*
*Completed: 2026-01-27*
