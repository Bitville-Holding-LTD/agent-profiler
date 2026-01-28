---
phase: 05-postgres-agent-database-monitoring
plan: 02
subsystem: database
tags: [postgresql, psycopg3, psutil, monitoring, pg_stat_activity, pg_stat_statements, pg_locks]

# Dependency graph
requires:
  - phase: 05-01
    provides: Project structure and database configuration module
provides:
  - pg_stat_activity collector with correlation ID extraction from application_name
  - pg_stat_statements collector with graceful degradation when extension unavailable
  - Lock detection using PostgreSQL wiki query for blocking queries
  - System metrics collector for CPU, memory, disk I/O, network I/O
affects: [05-03-transmission-and-buffering, 05-04-daemon-and-systemd-service]

# Tech tracking
tech-stack:
  added: [psycopg_pool, structlog, psutil]
  patterns: [correlation ID extraction via regex, graceful degradation for missing extensions, connection pooling for database queries, structured logging]

key-files:
  created:
    - postgres-agent/src/collectors/__init__.py
    - postgres-agent/src/collectors/pg_activity.py
    - postgres-agent/src/collectors/pg_statements.py
    - postgres-agent/src/collectors/pg_locks.py
    - postgres-agent/src/collectors/system_metrics.py
  modified: []

key-decisions:
  - "Correlation ID extraction via regex pattern bitville-([a-f0-9-]{36}) from application_name"
  - "Graceful degradation: pg_stat_statements returns empty list if extension not installed"
  - "Query truncation at 1000 chars for pg_stat_statements, 500 chars for locks to prevent payload bloat"
  - "Load average collection with Unix-specific exception handling for cross-platform compatibility"
  - "Lock detection uses official PostgreSQL wiki monitoring query"

patterns-established:
  - "Pattern 1: Correlation ID extraction - PHP agent sets application_name to 'bitville-{uuid}', Postgres agent extracts UUID for request linking"
  - "Pattern 2: Graceful degradation - Check extension availability once, cache result, return empty list if unavailable"
  - "Pattern 3: Timestamp serialization - Convert Python datetime to ISO format strings for JSON compatibility"
  - "Pattern 4: IP address serialization - Convert psycopg IP address objects to strings for JSON"

# Metrics
duration: 2min 20sec
completed: 2026-01-28
---

# Phase 5 Plan 2: Data Collectors Summary

**Four PostgreSQL data collectors with correlation ID extraction, graceful degradation, and comprehensive system metrics**

## Performance

- **Duration:** 2 min 20 sec
- **Started:** 2026-01-28T09:36:32Z
- **Completed:** 2026-01-28T09:38:52Z
- **Tasks:** 3
- **Files created:** 5

## Accomplishments
- pg_stat_activity collector extracts correlation IDs from application_name for PHP request linking (PG-01, PG-05)
- pg_stat_statements collector with graceful degradation when extension not installed (PG-02)
- Lock detection using PostgreSQL wiki query identifies blocking queries (PG-06)
- System metrics collection via psutil for CPU, memory, disk I/O, network I/O (PG-04)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pg_stat_activity collector with correlation ID extraction** - `b8b6e04` (feat)
2. **Task 2: Create pg_stat_statements collector with graceful degradation** - `f7e5d44` (feat)
3. **Task 3: Create lock detection and system metrics collectors** - `d03a550` (feat)

## Files Created/Modified

### Created
- `postgres-agent/src/collectors/__init__.py` - Collector module exports
- `postgres-agent/src/collectors/pg_activity.py` - Queries pg_stat_activity, extracts correlation IDs from application_name
- `postgres-agent/src/collectors/pg_statements.py` - Queries pg_stat_statements with extension availability check
- `postgres-agent/src/collectors/pg_locks.py` - Detects blocking queries using PostgreSQL wiki lock monitoring query
- `postgres-agent/src/collectors/system_metrics.py` - Collects CPU, memory, disk I/O, network I/O via psutil

## Decisions Made

**1. Correlation ID extraction pattern: bitville-{uuid}**
- PHP agent sets application_name to "bitville-{correlation_id}" format
- Postgres agent uses regex `bitville-([a-f0-9-]{36})` to extract UUID
- Enables linking database activity back to PHP requests

**2. Graceful degradation for pg_stat_statements**
- Check extension availability once on first call, cache result globally
- Return empty list if extension not installed instead of crashing
- Log warning with installation hint for operators

**3. Query truncation to prevent payload bloat**
- pg_stat_statements: truncate queries at 1000 characters
- pg_locks: truncate queries at 500 characters (2 queries per record)
- Append "...[truncated]" suffix for visibility

**4. Timestamp and IP address serialization**
- Convert Python datetime objects to ISO format strings
- Convert psycopg IP address objects to strings
- Ensures JSON serialization compatibility for transmission

**5. PostgreSQL wiki lock monitoring query**
- Use official PostgreSQL wiki query for lock detection
- Comprehensive JOIN logic to match blocked and blocking processes
- Proven, battle-tested approach from PostgreSQL community

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all collectors implemented as specified.

## User Setup Required

None - collectors are internal modules called by daemon (to be implemented in 05-04).

## Next Phase Readiness

**Ready for Plan 05-03: Transmission and Buffering**
- All data collectors implemented and ready to be called
- Collectors return serializable data structures (dicts with JSON-compatible values)
- Graceful error handling ensures collectors never crash daemon
- Correlation ID extraction ready for PHP request linking

**Next steps:**
- Plan 05-03: Implement HTTP transmission, circuit breaker, and local buffering
- Plan 05-04: Create daemon main loop that calls these collectors every 60 seconds
- Plan 05-05: Add systemd service and deployment configuration

**Blockers:** None

---
*Phase: 05-postgres-agent-database-monitoring*
*Completed: 2026-01-28*
