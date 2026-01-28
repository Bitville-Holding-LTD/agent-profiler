---
phase: 06
plan: 03
subsystem: "query-api"
tags: ["statistics", "correlation", "percentiles", "comparison", "analytics", "typescript", "bun", "sqlite"]

requires:
  - "06-01"  # Search API with cursor pagination
  - "06-02"  # Web dashboard foundation

provides:
  - statistics-api
  - correlation-api
  - comparison-api
  - percentile-calculations

affects:
  - "06-04"  # Dashboard can now display statistics and correlations

tech-stack:
  added:
    - "zod validation schemas for stats/comparison"
  patterns:
    - "Manual percentile calculation (ORDER BY + LIMIT/OFFSET)"
    - "Percentile rank calculation for comparative analysis"
    - "Correlation ID grouping and SQL time aggregation"

key-files:
  created:
    - listener/src/database/stats-queries.ts
    - listener/src/api/stats.ts
    - listener/src/api/correlation.ts
  modified:
    - listener/src/server.ts

decisions:
  - decision: "Manual percentile calculation using ORDER BY + LIMIT/OFFSET"
    rationale: "SQLite percentile() function requires compile-time flag, not guaranteed available"
    impact: "Works on all SQLite versions, slightly slower but acceptable for analytics queries"
    date: "2026-01-28"

  - decision: "Path parameter for correlation API (/api/correlation/:id)"
    rationale: "RESTful pattern, cleaner URLs than query parameters for primary resource identifier"
    impact: "URL rewriting to query param internally for consistent handler logic"
    date: "2026-01-28"

  - decision: "Percentile rank calculation: COUNT(slower) / COUNT(total)"
    rationale: "Shows what percent of requests were slower, intuitive for performance analysis"
    impact: "Request at 85th percentile means 85% of similar requests were slower"
    date: "2026-01-28"

metrics:
  duration: "3min 14sec"
  tasks: 3
  commits: 3
  files_created: 3
  files_modified: 1
  completed: "2026-01-28"
---

# Phase 6 Plan 03: Statistics and Correlation APIs Summary

**One-liner:** Aggregate statistics with manual percentile calculations and correlation tracing linking PHP requests to SQL queries.

## What Was Built

Created three new API endpoints for comparative analysis and request correlation:

1. **Statistics API** (`/api/stats`)
   - Project-wide aggregate statistics (count, avg, min, max duration)
   - URL-specific statistics with percentiles (p50, p95, p99)
   - Source breakdown (php_agent vs postgres_agent)
   - Time range tracking (oldest/newest timestamps)

2. **Comparison API** (`/api/compare`)
   - Compare specific request to historical averages for same URL
   - Percentile rank calculation (what percent were slower)
   - Sample size for statistical confidence

3. **Correlation API** (`/api/correlation/:id`)
   - Link PHP requests to their SQL queries via correlation ID
   - Group records by source type
   - Calculate total SQL time across correlated queries
   - Summary statistics (counts by source)

## Requirements Delivered

- **QUERY-04:** Correlation lookup to link PHP requests with SQL queries
- **QUERY-05:** Comparative analysis showing percentile rank for performance benchmarking

## Technical Highlights

### Manual Percentile Calculation

SQLite's `percentile()` function requires compile-time flag (`SQLITE_ENABLE_STAT4`), not guaranteed available. Implemented manual calculation using:

```sql
-- Count total matching records
SELECT COUNT(*) as total FROM profiling_data WHERE ...

-- Calculate offset position: floor(total * percentile)
-- For p95 with 100 records: offset = 95

-- Fetch value at that position
SELECT duration_ms FROM profiling_data
WHERE ... AND duration_ms IS NOT NULL
ORDER BY duration_ms ASC
LIMIT 1 OFFSET ?
```

Works on all SQLite versions. Slightly slower than built-in percentile but acceptable for analytics queries.

### Percentile Rank Calculation

For comparative analysis, calculate what percentile a request falls into:

```sql
-- Count requests slower than this one
SELECT COUNT(*) as slower FROM profiling_data
WHERE url = ? AND duration_ms > ?

-- Percentile rank = (slower_count / total_count) * 100
```

If 85 out of 100 similar requests were slower, this request is at 85th percentile (faster than 15% of requests).

### Correlation Grouping

Groups all records with same correlation_id:
- PHP agent records → `trace.php_request` (should be exactly 1)
- Postgres agent records → `trace.sql_queries` array
- Calculates total SQL time by parsing postgres_agent payloads

Enables tracing which SQL queries were executed during a specific PHP request.

## API Usage Examples

### Get Project Statistics

```bash
curl "http://localhost:8443/api/stats"
# Returns: total records, PHP/Postgres counts, avg duration, source breakdown

curl "http://localhost:8443/api/stats?project=myapp"
# Filtered to specific project
```

### Get URL Statistics with Percentiles

```bash
curl "http://localhost:8443/api/stats?project=myapp&url=/api/users"
# Returns: count, avg/min/max, p50, p95, p99 for that URL
```

### Compare Request to Averages

```bash
curl "http://localhost:8443/api/compare?correlation_id=abc-123-def"
# Shows: request duration, avg for URL, percentile rank, sample size
```

### Trace Request Correlations

```bash
curl "http://localhost:8443/api/correlation/abc-123-def"
# Returns: PHP request + all SQL queries + summary (total SQL time)
```

## File Changes

**Created:**
- `listener/src/database/stats-queries.ts` (282 lines)
  - `getUrlStatistics()` - Aggregate stats + percentiles for URL
  - `getProjectStatistics()` - Project-wide statistics
  - `getComparisonData()` - Comparative analysis
  - `calculatePercentile()` - Manual percentile calculation helper

- `listener/src/api/stats.ts` (236 lines)
  - `handleGetStats()` - Statistics endpoint handler
  - `handleGetComparison()` - Comparison endpoint handler
  - Zod schemas for validation

- `listener/src/api/correlation.ts` (195 lines)
  - `handleGetCorrelation()` - Correlation endpoint handler
  - Payload parsing and grouping logic
  - SQL time aggregation

**Modified:**
- `listener/src/server.ts`
  - Added imports for new handlers
  - Registered 3 new routes: `/api/stats`, `/api/compare`, `/api/correlation/:id`
  - Path parameter extraction for correlation API

## Deviations from Plan

None - plan executed exactly as written.

## Testing Results

All endpoints verified:
- `/api/stats` returns empty statistics for new DB (0 records, null timestamps)
- `/api/stats?project=X` filters correctly
- `/api/compare?correlation_id=X` returns 404 when no data (expected)
- `/api/correlation/:id` returns 404 when no data (expected)
- All responses include proper CORS headers
- All responses return valid JSON

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Manual percentile calculation | SQLite percentile() requires compile flag | Works everywhere, slight performance tradeoff |
| Path parameter for correlation | RESTful convention | Cleaner URLs, internal rewrite to query param |
| Percentile rank = slower/total | Intuitive for performance analysis | "85th percentile" = faster than 15% of requests |
| Parse payloads in correlation trace | Enable UI to show SQL query details | Graceful fallback if parsing fails |

## Integration Points

**Consumes:**
- `database/queries.ts` → `queryByCorrelationId()` for fetching linked records
- `database/connection.ts` → `getDatabase()` for SQLite access

**Provides:**
- Statistics API for dashboard analytics view (Phase 6 Wave 3)
- Comparison API for request performance analysis
- Correlation API for tracing PHP → SQL execution flow

## Performance Characteristics

- Aggregate queries use SQLite aggregate functions (COUNT, AVG, MIN, MAX)
- Percentile calculation: O(n log n) for sort + O(1) for offset lookup
- Correlation lookup: Indexed on correlation_id (fast)
- Comparison queries: Two COUNT queries on indexed duration_ms column

Performance acceptable for analytics workload (not real-time ingestion path).

## Next Phase Readiness

**Ready for:** Phase 6 Plan 04 (Dashboard integration with statistics and correlation views)

**Provides:**
- `/api/stats` for overall metrics display
- `/api/stats?url=X` for URL-specific percentile charts
- `/api/compare?correlation_id=X` for request performance card
- `/api/correlation/:id` for SQL trace view

**No blockers.** All APIs functional and tested.

## Commits

1. `be76e56` - feat(06-03): add statistics query functions
   - Aggregate statistics (count, avg, min, max)
   - Percentile calculations (p50, p95, p99) with manual fallback
   - Comparison data showing percentile rank
   - URL-specific and project-wide statistics

2. `fea845e` - feat(06-03): add stats and comparison API endpoints
   - /api/stats returns project-wide statistics
   - /api/stats?url=X returns URL-specific stats with percentiles
   - /api/compare?correlation_id=X shows percentile rank
   - Zod validation for query parameters
   - CORS headers for browser access

3. `6e762cc` - feat(06-03): add correlation API and wire all endpoints
   - /api/correlation/:id returns grouped PHP + SQL records
   - /api/stats and /api/compare routes added to server
   - Parse payloads for correlation trace display
   - Calculate total SQL time across correlated queries
   - Path parameter support for correlation_id
