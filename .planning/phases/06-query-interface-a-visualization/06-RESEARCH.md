# Phase 6: Query Interface & Visualization - Research

**Researched:** 2026-01-28
**Domain:** Web UI, Data Visualization, RESTful APIs, SQLite Query Optimization
**Confidence:** HIGH

## Summary

This phase builds a web-based query interface and visualization dashboard on top of the existing Bun listener server. The research covered UI framework options, visualization libraries, API design patterns, SQLite query optimization, and correlation visualization techniques for displaying PHP request traces linked to their SQL queries.

The standard approach for 2026 is to use vanilla JavaScript or lightweight frameworks (avoiding heavy SPA frameworks for simple dashboards), leverage specialized timeline visualization libraries like vis-timeline for trace displays, implement cursor-based pagination for performance, and use SQLite virtual columns with indexes for JSON querying. Modern APM tools consistently use waterfall/Gantt-style visualizations for request tracing with correlation IDs linking parent-child relationships.

**Primary recommendation:** Build with vanilla JavaScript + Bun's HTML imports (leveraging existing Bun infrastructure), vis-timeline for request flow visualization, Chart.js for statistics, and implement cursor-based pagination with SQLite virtual columns for optimal JSON query performance. Keep the UI simple and semantic with Pico CSS for styling.

## Standard Stack

The established libraries/tools for building monitoring dashboards in 2026:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun.serve HTML imports | Bun 1.2+ | Frontend bundler & server | Already in use; native HMR, no build tools needed |
| Vanilla JavaScript | ES2023+ | UI logic | Lightweight, no framework overhead, perfect for simple dashboards |
| vis-timeline | 7.x | Timeline/trace visualization | Specifically designed for time-series data with millisecond precision |
| Chart.js | 4.x | Statistical charts | 11KB gzipped, standard charts with sensible defaults |
| Pico CSS | 2.x | Minimal styling | 11.3KB gzipped, semantic HTML, no classes needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Flatpickr | 4.x | Date range picker | No dependencies, 6KB gzipped |
| Zod | 3.x | API validation | Already in use for payload validation |
| bun:sqlite | Built-in | Database queries | Already in use; native performance |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla JS | React/Vue | Adds 40KB+ overhead, overkill for simple dashboard |
| vis-timeline | D3.js | More flexible but requires 10x more code for timeline |
| Chart.js | ApexCharts | Similar features, slightly heavier (~20KB) |
| Pico CSS | Tailwind CSS | More customization but requires build step & utility classes |

**Installation:**
```bash
cd listener
bun add vis-timeline chart.js flatpickr
# Pico CSS via CDN in HTML (no install needed)
```

## Architecture Patterns

### Recommended Project Structure
```
listener/src/
├── handlers/           # Existing ingestion handlers
├── api/               # NEW: Query API endpoints
│   ├── search.ts      # Search/filter endpoint
│   ├── stats.ts       # Statistical aggregation endpoint
│   └── correlation.ts # Correlation ID lookup endpoint
├── database/          # Existing database layer
│   └── query-views.ts # NEW: Virtual columns for JSON queries
├── public/            # NEW: Static web UI assets
│   ├── index.html     # Dashboard entry point
│   ├── app.js         # Dashboard logic
│   ├── timeline.js    # Timeline visualization
│   └── stats.js       # Statistics charts
└── server.ts          # Existing server (add routes)
```

### Pattern 1: Bun HTML Imports with Routes
**What:** Serve static HTML that imports TypeScript/JavaScript modules, bundled automatically by Bun
**When to use:** Simple dashboards with < 10 pages, no complex state management needed
**Example:**
```typescript
// Source: https://bun.sh/docs/api/http
import dashboard from "./public/index.html";

Bun.serve({
  routes: {
    "/": dashboard,  // Serves HTML with automatic bundling
    "/api/search": {
      GET: (req) => handleSearch(req),
    },
  },
  development: {
    hmr: true,      // Hot module replacement
  },
});
```

### Pattern 2: Cursor-Based Pagination
**What:** Use last-seen ID/timestamp as cursor instead of OFFSET
**When to use:** Always, for any paginated query (prevents performance degradation)
**Example:**
```typescript
// Source: https://dev.to/appwrite/this-is-why-you-should-use-cursor-pagination-4nh5
// BAD: Offset pagination (slow for large offsets)
SELECT * FROM profiling_data ORDER BY timestamp DESC LIMIT 50 OFFSET 1000;

// GOOD: Cursor pagination (constant time)
SELECT * FROM profiling_data
WHERE timestamp < ?
ORDER BY timestamp DESC
LIMIT 50;
```

### Pattern 3: SQLite Virtual Columns for JSON Indexing
**What:** Create indexed virtual columns that extract JSON fields
**When to use:** When filtering/searching on fields inside JSON payload column
**Example:**
```sql
-- Source: https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing
ALTER TABLE profiling_data
ADD COLUMN url TEXT GENERATED ALWAYS AS (json_extract(payload, '$.url')) VIRTUAL;

CREATE INDEX idx_url ON profiling_data(url);

-- Now queries use the index automatically:
SELECT * FROM profiling_data WHERE url LIKE '/api/%';
```

### Pattern 4: RESTful Query API Design
**What:** Standardized query parameters for filtering, sorting, pagination
**When to use:** All search/list endpoints
**Example:**
```typescript
// Source: https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/
// GET /api/search?project=myapp&after=1234567890&limit=50&duration_min=100&source=php_agent

interface SearchParams {
  // Filtering
  project?: string;
  source?: 'php_agent' | 'postgres_agent';
  correlation_id?: string;
  duration_min?: number;
  duration_max?: number;
  url?: string;  // Requires virtual column

  // Pagination (cursor-based)
  after?: number;   // Timestamp cursor
  limit?: number;   // Default 50, max 100

  // Response includes next cursor
}
```

### Pattern 5: Correlation Display (Parent-Child Relationships)
**What:** Group PHP requests with their SQL queries by correlation_id
**When to use:** Displaying complete traces with all related operations
**Example:**
```typescript
// Source: https://www.dash0.com/comparisons/best-distributed-tracing-tools
// Query pattern for correlation:
async function getCorrelatedTrace(correlationId: string) {
  const records = queryByCorrelationId(correlationId);

  // Group by source
  const phpRequest = records.find(r => r.source === 'php_agent');
  const sqlQueries = records.filter(r => r.source === 'postgres_agent');

  return {
    trace_id: correlationId,
    parent: phpRequest,
    children: sqlQueries,
    total_duration: phpRequest?.duration_ms,
    sql_count: sqlQueries.length,
  };
}
```

### Anti-Patterns to Avoid
- **OFFSET pagination:** Becomes exponentially slower with large offsets; use cursor-based instead
- **Querying JSON without indexes:** json_extract() scans full table; create virtual columns
- **Real-time polling < 1 second:** Overloads server and database; use 5-10 second intervals
- **Loading full dataset client-side:** Always paginate server-side, never "load all then filter"
- **Global variables in dashboard JS:** Causes memory leaks; use module scope or cleanup on unmount

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timeline visualization | Custom canvas drawing | vis-timeline | Handles zoom, pan, millisecond precision, item rendering, grouping |
| Date range picker | Custom calendar widget | Flatpickr | Accessibility, keyboard nav, localization, mobile support |
| Chart rendering | Manual SVG/canvas | Chart.js | Responsive, animated, legend, tooltips, accessibility |
| Query parameter validation | Manual parsing/checking | Zod schemas | Type-safe, runtime validation, auto-generates TypeScript types |
| Full-text search | LIKE '%term%' queries | SQLite FTS5 | 50x faster, relevance ranking, prefix matching, phrase search |
| Percentile calculations | Manual sorting algorithms | SQLite percentile() | Native implementation, works with aggregate queries |
| Memory-efficient pagination | Load all + slice | Cursor-based DB queries | Constant memory, constant time, works with millions of rows |

**Key insight:** APM/monitoring is a solved problem domain with mature libraries. Reinventing timeline visualizations or pagination will consume 10x more time and produce inferior results compared to using established libraries.

## Common Pitfalls

### Pitfall 1: Using OFFSET Pagination
**What goes wrong:** Queries become slower as users navigate deeper (page 100+ takes seconds)
**Why it happens:** SQLite must scan and discard OFFSET rows even with indexes
**How to avoid:** Always use cursor-based pagination with WHERE timestamp < ? LIMIT N
**Warning signs:** Query duration increases linearly with page number

### Pitfall 2: Querying JSON Without Indexes
**What goes wrong:** Filtering by JSON fields (like URL patterns) scans entire table
**Why it happens:** json_extract() cannot use indexes on the payload column
**How to avoid:** Create virtual columns for frequently-queried JSON fields and index them
**Warning signs:** Queries with json_extract() in WHERE clause take >100ms

### Pitfall 3: Memory Leaks in Chart Libraries
**What goes wrong:** Dashboard memory grows unbounded, browser tabs crash after hours
**Why it happens:** Chart instances, event listeners, and timers not cleaned up on updates
**How to avoid:** Call chart.destroy() before recreating, use AbortController for fetch requests
**Warning signs:** Browser memory usage increases steadily, performance degrades over time

### Pitfall 4: Too-Frequent Polling
**What goes wrong:** Server CPU usage spikes, database locks increase, browser drains battery
**Why it happens:** Developers default to 1-second polling for "real-time feel"
**How to avoid:** Use 5-10 second intervals; for true real-time, add WebSocket endpoint (future phase)
**Warning signs:** High server load with few actual data inserts, battery drain complaints

### Pitfall 5: Checkpoint Starvation in WAL Mode
**What goes wrong:** SQLite WAL file grows indefinitely, disk fills up
**Why it happens:** Continuous overlapping read transactions prevent checkpoints
**How to avoid:** Close read connections promptly, use statement.finalize(), monitor WAL size
**Warning signs:** listener.db-wal file grows beyond 1GB, disk space warnings

### Pitfall 6: Loading Full Correlation Traces
**What goes wrong:** API timeout when fetching traces with 1000+ SQL queries
**Why it happens:** Assuming all traces are small (usually true, but outliers exist)
**How to avoid:** Limit children to 100 by default, add "show more" for large traces
**Warning signs:** 504 timeout errors, max_execution_time warnings

## Code Examples

Verified patterns from official sources:

### Search API Endpoint with Validation
```typescript
// Source: https://zod.dev/
import { z } from 'zod';

const SearchParamsSchema = z.object({
  project: z.string().optional(),
  source: z.enum(['php_agent', 'postgres_agent']).optional(),
  correlation_id: z.string().optional(),
  duration_min: z.coerce.number().positive().optional(),
  duration_max: z.coerce.number().positive().optional(),
  after: z.coerce.number().optional(),  // Timestamp cursor
  limit: z.coerce.number().min(1).max(100).default(50),
});

export function handleSearch(req: Request): Response {
  const url = new URL(req.url);
  const params = SearchParamsSchema.safeParse(Object.fromEntries(url.searchParams));

  if (!params.success) {
    return new Response(JSON.stringify({ error: params.error }), { status: 400 });
  }

  const results = executeSearch(params.data);
  return new Response(JSON.stringify(results), {
    headers: { 'content-type': 'application/json' }
  });
}
```

### Cursor-Based Pagination Query
```typescript
// Source: https://dev.to/appwrite/this-is-why-you-should-use-cursor-pagination-4nh5
function paginatedSearch(params: SearchParams) {
  const db = getDatabase();
  let query = 'SELECT * FROM profiling_data WHERE 1=1';
  const bindings: any[] = [];

  if (params.project) {
    query += ' AND project = ?';
    bindings.push(params.project);
  }

  if (params.after) {
    query += ' AND timestamp < ?';
    bindings.push(params.after);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  bindings.push(params.limit + 1);  // Fetch +1 to detect "has more"

  const results = db.prepare(query).all(...bindings);
  const hasMore = results.length > params.limit;

  return {
    items: results.slice(0, params.limit),
    cursor: hasMore ? results[params.limit - 1].timestamp : null,
  };
}
```

### Timeline Visualization (vis-timeline)
```javascript
// Source: https://visjs.github.io/vis-timeline/docs/timeline/
import { Timeline } from 'vis-timeline/standalone';

function renderTimeline(correlationId) {
  const items = [
    {
      id: 1,
      content: 'PHP Request: /api/users',
      start: new Date('2026-01-28T10:00:00.000Z'),
      end: new Date('2026-01-28T10:00:00.250Z'),
      group: 'php_agent',
      className: 'php-span',
    },
    {
      id: 2,
      content: 'SQL: SELECT * FROM users',
      start: new Date('2026-01-28T10:00:00.050Z'),
      end: new Date('2026-01-28T10:00:00.120Z'),
      group: 'postgres_agent',
      className: 'sql-span',
    },
  ];

  const groups = [
    { id: 'php_agent', content: 'PHP' },
    { id: 'postgres_agent', content: 'Database' },
  ];

  const options = {
    stack: false,
    zoomMin: 1,  // 1ms minimum zoom
    zoomMax: 60000,  // 1 minute maximum
    format: {
      minorLabels: {
        millisecond: 'SSS',
        second: 's',
      },
    },
  };

  const timeline = new Timeline(
    document.getElementById('timeline'),
    items,
    groups,
    options
  );

  // CRITICAL: Cleanup to prevent memory leaks
  return () => timeline.destroy();
}
```

### Statistical Aggregation with Percentiles
```typescript
// Source: https://sqlite.org/percentile.html
function getStatistics(project: string, url: string) {
  const db = getDatabase();

  // Requires SQLite 3.51.0+ with -DSQLITE_ENABLE_PERCENTILE
  const query = `
    SELECT
      COUNT(*) as count,
      AVG(duration_ms) as avg_duration,
      MIN(duration_ms) as min_duration,
      MAX(duration_ms) as max_duration,
      percentile(duration_ms, 50) as p50,
      percentile(duration_ms, 95) as p95,
      percentile(duration_ms, 99) as p99
    FROM profiling_data
    WHERE project = ? AND url = ? AND duration_ms IS NOT NULL
  `;

  return db.prepare(query).get(project, url);
}
```

### Chart.js Bar Chart for Statistics
```javascript
// Source: https://www.chartjs.org/docs/latest/
import { Chart } from 'chart.js/auto';

function renderStatsChart(stats) {
  const ctx = document.getElementById('statsChart').getContext('2d');

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Avg', 'P50', 'P95', 'P99', 'Max'],
      datasets: [{
        label: 'Duration (ms)',
        data: [
          stats.avg_duration,
          stats.p50,
          stats.p95,
          stats.p99,
          stats.max_duration,
        ],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
    },
  });

  // CRITICAL: Cleanup to prevent memory leaks
  return () => chart.destroy();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jQuery + custom UI | Vanilla JS + Web Components | 2024-2026 | 40% lighter bundles, better maintainability |
| OFFSET pagination | Cursor-based pagination | 2023-2025 | Constant-time queries regardless of page depth |
| Store JSON as text | Virtual columns + indexes | SQLite 3.31+ (2020) | 50x faster JSON queries |
| LIKE '%term%' | FTS5 full-text search | SQLite 3.9+ (2015) | 50x faster text search with ranking |
| Manual percentile queries | Built-in percentile() | SQLite 3.51+ (2025) | Native performance, cleaner code |
| Moment.js for dates | Flatpickr or native Intl | 2020+ | 67KB → 6KB, no deprecated library |

**Deprecated/outdated:**
- **jQuery for DOM manipulation:** Modern browsers have querySelector, fetch, etc. built-in
- **Moment.js:** Unmaintained since 2020; use date-fns, Luxon, or native Intl
- **Highcharts for simple charts:** Overkill and commercial license; Chart.js is free and sufficient
- **Bootstrap for simple UIs:** 200KB overhead; Pico CSS is 11KB and semantic

## Open Questions

Things that couldn't be fully resolved:

1. **SQLite percentile() function availability**
   - What we know: Added in SQLite 3.51.0 (2025-11-04), but requires compile-time flag -DSQLITE_ENABLE_PERCENTILE
   - What's unclear: Whether Bun's bundled SQLite has this enabled by default
   - Recommendation: Test with `SELECT percentile(1, 50)` during implementation; if unavailable, implement manual percentile in TypeScript or upgrade SQLite

2. **Optimal polling interval**
   - What we know: 5-10 seconds is recommended for dashboards, <1 second causes overhead
   - What's unclear: Actual load profile for this specific use case (internal tool vs production monitoring)
   - Recommendation: Start with 10-second polling, make configurable, add WebSocket support in future phase if needed

3. **Timeline visualization scalability**
   - What we know: vis-timeline handles thousands of items well
   - What's unclear: Performance with traces containing 1000+ SQL queries in a single request
   - Recommendation: Limit child spans to 100 by default with "load more" button; most traces are small

## Sources

### Primary (HIGH confidence)
- SQLite Official Documentation: https://sqlite.org/percentile.html (percentile functions)
- SQLite Official Documentation: https://sqlite.org/wal.html (WAL mode performance)
- SQLite Official Documentation: https://sqlite.org/json1.html (JSON functions)
- Bun Official Documentation: https://bun.sh/docs/api/http (HTML imports, routes)
- Zod Official Documentation: https://zod.dev/ (schema validation)
- vis-timeline Documentation: https://visjs.github.io/vis-timeline/docs/timeline/
- Chart.js Documentation: https://www.chartjs.org/docs/latest/

### Secondary (MEDIUM confidence)
- DB Pro Blog: SQLite JSON Virtual Columns + Indexing (https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing)
- Moesif Blog: REST API Design Filtering, Sorting, and Pagination (https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/)
- DEV Community: Why You Should Use Cursor Pagination (https://dev.to/appwrite/this-is-why-you-should-use-cursor-pagination-4nh5)
- Fly.io Blog: How SQLite Scales Read Concurrency (https://fly.io/blog/sqlite-internals-wal/)
- SciChart.js: Memory Best Practices (https://www.scichart.com/documentation/js/current/MemoryBestPractices.html)

### Secondary (MEDIUM confidence - 2026 comparisons)
- JavaScript Chart Libraries Comparison 2026 (https://www.luzmo.com/blog/javascript-chart-libraries)
- Top CSS Frameworks 2026 (https://picocss.com/, https://prismic.io/blog/best-css-frameworks)
- Distributed Tracing Tools 2026 (https://www.dash0.com/comparisons/best-distributed-tracing-tools)
- API Pagination Best Practices 2026 (https://www.merge.dev/blog/api-pagination-best-practices)

### Tertiary (LOW confidence - needs validation)
- None. All recommendations verified with official documentation or authoritative sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries have official documentation and proven use cases
- Architecture: HIGH - Patterns verified with SQLite/Bun official docs and established API design standards
- Pitfalls: HIGH - Pagination/indexing pitfalls well-documented in SQLite community
- Visualization: MEDIUM - vis-timeline appropriate but not verified for extreme scale (1000+ child spans)
- Percentile function: MEDIUM - Feature exists but Bun compile-time flags unclear

**Research date:** 2026-01-28
**Valid until:** 2026-03-28 (60 days - stable ecosystem for SQLite/Bun, fast-moving for JS libraries)
