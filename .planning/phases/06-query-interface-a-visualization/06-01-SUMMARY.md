---
phase: 06-query-interface
plan: 01
subsystem: api
tags: [search, pagination, zod, validation, sqlite, virtual-columns, rest-api]

# Dependency graph
requires:
  - phase: 03-central-listener
    provides: SQLite database with profiling_data table, HTTP server infrastructure
  - phase: 05-postgres-agent
    provides: postgres_agent data source type in profiling_data table
provides:
  - Search API endpoint with cursor-based pagination
  - Zod-validated query parameters (project, source, url, duration, timestamp)
  - Virtual columns for URL indexing (url, http_method, status_code)
  - Migration registry pattern for database schema evolution
affects: [06-02-web-ui, visualization, reporting, future query features]

# Tech tracking
tech-stack:
  added: [zod for schema validation]
  patterns: [cursor-based pagination, virtual columns, migration registry, Zod query validation]

key-files:
  created:
    - listener/src/database/migrations.ts
    - listener/src/database/search-queries.ts
    - listener/src/api/search.ts
  modified:
    - listener/src/database/connection.ts
    - listener/src/server.ts

key-decisions:
  - "Virtual columns for JSON extraction enable indexes without storage overhead"
  - "Cursor-based pagination using timestamp ensures constant-time queries at any offset"
  - "Migration registry pattern tracks applied migrations for idempotent execution"
  - "Zod schema validation provides type-safe query parameters with detailed error messages"
  - "CORS headers (Access-Control-Allow-Origin: *) enable browser-based dashboard access"

patterns-established:
  - "Migration pattern: Registry with unique IDs, tracking table, idempotent execution"
  - "Pagination pattern: Fetch limit+1 rows, return cursor as last item's timestamp"
  - "API pattern: Zod validation → query execution → JSON response with CORS headers"

# Metrics
duration: 5min 12sec
completed: 2026-01-28
---

# Phase 6 Plan 1: Query Interface & Search API Summary

**Search API with cursor-based pagination, Zod validation, and virtual columns for URL indexing on JSON payload data**

## Performance

- **Duration:** 5 min 12 sec
- **Started:** 2026-01-28T10:50:37Z
- **Completed:** 2026-01-28T10:55:49Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Search API endpoint (`/api/search`) with multi-dimensional filtering (project, source, correlation_id, url, duration range, timestamp range)
- Cursor-based pagination for constant-time queries (no OFFSET performance degradation)
- Virtual columns (url, http_method, status_code) extracted from JSON payload with index support
- Migration registry pattern for database schema evolution with tracking table
- Zod schema validation for query parameters with detailed error messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migrations and virtual columns** - `0516a5f` (feat)
2. **Task 2: Search queries with cursor-based pagination** - `0539068` (feat)
3. **Task 3: Search API endpoint with Zod validation** - `70c796b` (feat)

## Files Created/Modified

- `listener/src/database/migrations.ts` - Migration registry with tracking table for idempotent schema evolution
- `listener/src/database/connection.ts` - Added runMigrations() call after schema creation
- `listener/src/database/search-queries.ts` - paginatedSearch(), getProjects(), getStatistics() with parameterized queries
- `listener/src/api/search.ts` - Search API handlers with Zod validation and CORS headers
- `listener/src/server.ts` - Added /api/search, /api/projects, /api/statistics routes and CORS preflight handler

## Decisions Made

**Virtual columns for JSON extraction**
- Rationale: SQLite virtual columns (GENERATED ALWAYS AS) enable indexing on JSON fields without storage overhead. Computed on read, indexed on disk. Enables fast URL filtering without full table scans.

**Cursor-based pagination using timestamp**
- Rationale: Timestamp-based cursor (WHERE timestamp < ?) provides constant-time queries at any offset, unlike OFFSET which degrades linearly. Critical for large datasets.

**Migration registry pattern**
- Rationale: Tracking applied migrations in _migrations table ensures idempotent execution. Safe to run multiple times, handles "duplicate column name" errors gracefully.

**Zod for query parameter validation**
- Rationale: Type-safe schema validation with automatic coercion (string → number) and detailed error messages. Already used in project, consistent with existing patterns.

**CORS headers (Access-Control-Allow-Origin: *)**
- Rationale: Enable browser-based dashboard to access API during development. Listener runs on internal network, not exposed to public internet.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed as specified without blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 6 Plan 2 (Web UI Dashboard):**
- Search API provides all filtering dimensions needed by UI
- CORS headers enable browser access from same-origin dashboard
- Cursor-based pagination supports infinite scroll or "Load More" patterns
- Projects endpoint populates filter dropdown
- Virtual columns optimize common query patterns (URL, HTTP method, status code)

**API Capabilities:**
- Filter by: project, source, correlation_id, url (pattern matching), duration range, timestamp range
- Pagination: cursor-based with hasMore flag
- Response includes: full payload JSON, extracted virtual columns, database metadata

**Performance characteristics:**
- Virtual columns add ~0 storage overhead
- Cursor pagination O(1) at any offset
- Index on url column for fast filtering
- Parameterized queries prevent SQL injection

---
*Phase: 06-query-interface*
*Completed: 2026-01-28*
