---
phase: 03-central-listener
plan: 01
subsystem: database
tags: [bun, sqlite, typescript, wal-mode, prepared-statements]

# Dependency graph
requires:
  - phase: 02-php-agent-daemon
    provides: HTTP POST transmission with circuit breaker
provides:
  - SQLite database with WAL mode and performance pragmas
  - Unified profiling_data table for PHP and Postgres agents
  - 5 indexes for query performance (correlation_id, project+timestamp, duration, source+timestamp, created_at)
  - Prepared statements for insert and query operations
  - TypeScript types for PHP and Postgres agent payloads
affects: [03-02-http-ingestion, 03-03-data-retention, 06-query-interface]

# Tech tracking
tech-stack:
  added: [bun, bun:sqlite, croner, zod]
  patterns: [singleton-database, prepared-statements, type-safe-queries]

key-files:
  created:
    - listener/package.json
    - listener/tsconfig.json
    - listener/src/database/schema.sql
    - listener/src/database/connection.ts
    - listener/src/database/queries.ts
    - listener/src/types/payloads.ts
  modified: []

key-decisions:
  - "WAL mode enabled first before any operations for concurrent reads during writes"
  - "Unified table for PHP and Postgres data with source discriminator column"
  - "Partial index on duration_ms for slow request queries (WHERE duration_ms IS NOT NULL)"
  - "Database path configurable via BITVILLE_DB_PATH env var (default: /var/lib/bitville/listener.db)"
  - "Prepared statements for all queries to prevent SQL injection and cache query plans"

patterns-established:
  - "Singleton database pattern with initDatabase() function"
  - "Runtime environment variable reading for testability"
  - "Prepared statements with type-safe wrappers"

# Metrics
duration: 3min 8sec
completed: 2026-01-27
---

# Phase 03 Plan 01: Database Foundation Summary

**SQLite database with WAL mode, unified profiling_data table, 5 performance indexes, and prepared statements for PHP/Postgres agent data storage**

## Performance

- **Duration:** 3 min 8 sec
- **Started:** 2026-01-27T19:56:19Z
- **Completed:** 2026-01-27T19:59:27Z
- **Tasks:** 3
- **Files modified:** 11 (8 created, 3 test files)

## Accomplishments
- Bun project initialized with TypeScript strict mode and core dependencies (croner, zod)
- SQLite database configured with WAL mode for concurrent reads during writes
- Unified profiling_data table supports both PHP agent requests and Postgres agent monitoring data
- 5 indexes created for query performance across all access patterns
- 6 prepared statement functions with type-safe TypeScript interfaces

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize Bun project with dependencies** - `410eadc` (chore)
2. **Task 2: Create SQLite schema and database connection** - `b6018b5` (feat)
3. **Task 3: Create prepared statements and TypeScript types** - `d01a214` (feat)

## Files Created/Modified

**Created:**
- `listener/package.json` - Bun project with croner (cron) and zod (validation) dependencies
- `listener/tsconfig.json` - Strict TypeScript configuration with Bun types
- `listener/src/database/schema.sql` - Unified profiling_data table and 5 indexes
- `listener/src/database/connection.ts` - Database singleton with WAL mode and performance pragmas
- `listener/src/database/queries.ts` - 6 prepared statement functions (insert, query by correlation/project/time, delete, count)
- `listener/src/types/payloads.ts` - TypeScript interfaces for PhpAgentPayload, PostgresAgentPayload, ProfilingDataRow
- `listener/test-db.ts` - Database initialization verification test
- `listener/test-queries.ts` - Prepared statements verification test

**Performance pragmas configured:**
- `journal_mode = WAL` - Concurrent reads during writes
- `synchronous = NORMAL` - Balance safety vs performance
- `cache_size = -50000` - 50MB cache
- `temp_store = MEMORY` - Temp tables in RAM
- `auto_vacuum = INCREMENTAL` - Gradual space reclamation

**Indexes created:**
- `idx_correlation_id` - Primary correlation lookup
- `idx_project_timestamp` - Time-range queries per project
- `idx_duration` - Slow request identification (partial index WHERE duration_ms IS NOT NULL)
- `idx_source_timestamp` - Agent-specific queries
- `idx_created_at` - Retention cleanup

## Decisions Made

**1. WAL mode enabled first before any operations**
- Ensures concurrent reads during writes from the start
- Critical for multi-connection scenarios (HTTP server + cleanup cron)

**2. Unified table for PHP and Postgres data**
- Simplifies correlation queries (single table JOIN on correlation_id)
- Easier retention policy (single DELETE statement for 7-day cleanup)
- Source column discriminates data origin

**3. Partial index on duration_ms**
- WHERE clause excludes NULL values (Postgres agent records without duration)
- Smaller index size, faster queries for slow request identification

**4. Runtime environment variable reading**
- DB path read inside initDatabase() function, not at module load time
- Enables test scripts to override path before initialization
- Pattern established for all environment configuration

**5. Prepared statements for all operations**
- SQL injection protection even from trusted agents
- Query plan caching for repeated queries
- Type-safe wrappers with TypeScript interfaces

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Initial database path issue in tests**
- **Problem:** Environment variable read at module load time prevented test override
- **Solution:** Moved DB path reading inside initDatabase() function for runtime configuration
- **Result:** Tests can set BITVILLE_DB_PATH before calling initDatabase()

All verification tests pass:
- ✅ WAL mode enabled
- ✅ Table and indexes created
- ✅ Insert and query operations work
- ✅ TypeScript compilation successful

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 3 Plan 2 (HTTP Ingestion):**
- Database layer complete and tested
- Prepared statements ready for HTTP handlers
- TypeScript types match PHP agent payload structure from listener.php
- Performance optimizations configured (WAL mode, pragmas, indexes)

**Database is production-ready:**
- WAL mode for concurrency
- Performance pragmas configured
- Indexes for all query patterns
- Type-safe query interface
- Retention cleanup prepared (deleteOldRecords function)

---
*Phase: 03-central-listener*
*Completed: 2026-01-27*
