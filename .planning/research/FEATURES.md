# Feature Research

**Domain:** Application Performance Monitoring (APM) for PHP Applications
**Researched:** 2026-01-27
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Function-level timing/traces | Core APM requirement - identify slow code paths | MEDIUM | Requires instrumentation hooks into PHP runtime. Can use register_tick_function or extension |
| Transaction tracing | End-to-end request visibility from entry to exit | MEDIUM | Capture request lifecycle with unique trace ID. Essential for distributed systems |
| Database query capture | SQL queries are most common bottleneck in web apps | MEDIUM | Hook into PDO/mysqli. Must capture query text, timing, result counts |
| Error and exception tracking | Users expect to see what broke and where | LOW | Hook into error handlers, capture stack traces |
| Memory usage per request | Memory leaks and spikes are common PHP issues | LOW | Use memory_get_usage() at function boundaries |
| Request metadata (URL, method, headers) | Context for understanding performance patterns | LOW | Capture from superglobals ($_SERVER, $_GET, $_POST) |
| Time-based filtering | Don't collect everything - only slow requests | LOW | Threshold-based profiling (e.g., >500ms). Reduces overhead and storage |
| System resource metrics (CPU, RAM, disk) | Infrastructure context for application performance | MEDIUM | Collect from /proc, use system calls. Essential for correlating app issues with infra |
| Timeline view | Visual representation of execution flow | MEDIUM | Show waterfall of function calls with timing. Critical for identifying bottlenecks |
| Search and filter | Query collected traces by URL, time, duration, error status | MEDIUM | Requires indexing strategy. Users need to find specific problematic requests |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Distributed tracing correlation | Correlate PHP traces with database activity using trace IDs | HIGH | For your use case: link PHP function → SQL query → pg_stat_activity. Gold mine for root cause analysis |
| Lock detection and tracking | Identify database locks causing request delays | HIGH | Query pg_locks + pg_stat_activity. Critical for your load spike investigation - locks can cascade |
| Slow query correlation | Link slow queries to the PHP code that triggered them | MEDIUM | Capture SQL with backtrace. Shows exactly which function caused problematic query |
| Query plan analysis | Capture EXPLAIN output for slow queries | MEDIUM | Run EXPLAIN automatically for queries >threshold. Identifies missing indexes, seq scans |
| Function-level memory profiling | Memory delta per function, not just per request | MEDIUM | Identify memory-hungry functions. Useful for finding hidden memory leaks |
| Comparative analysis | Compare current request vs baseline or similar requests | MEDIUM | "This checkout was 3x slower than usual" - helps identify anomalies vs systemic issues |
| Transaction blocking visualization | Visual chain showing which query blocks which | HIGH | Show lock dependency graph. Extremely valuable for understanding cascading lock issues |
| Automatic anomaly detection | AI/ML flagging unusual patterns without manual thresholds | HIGH | Learns normal patterns, alerts on deviations. Reduces need for manual threshold tuning |
| Code-level recommendations | Suggests fixes based on observed patterns (N+1, missing indexes) | HIGH | Pattern detection for common anti-patterns. Guides developers to solutions |
| Request replay capability | Re-run problematic request with same parameters for debugging | MEDIUM | Store request payload (sanitized). Helps reproduce issues in development |
| Hot path detection | Identify most-executed code paths consuming time | MEDIUM | Aggregate function call data to find optimization targets |
| Background job profiling | Profile queued/async jobs, not just HTTP requests | MEDIUM | Extends profiling to CLI scripts, queue workers. May not be needed for initial investigation |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time alerting | "I want to know immediately when something breaks" | For root cause analysis, you're reviewing historical data. Real-time adds complexity without value for your use case | Post-analysis alerting: flag patterns after collecting data |
| 100% profiling (no threshold) | "Profile everything to never miss anything" | Massive overhead (15-20% latency), storage explosion, analysis paralysis - drowning in data | Smart sampling: 1-10% normal traffic, 100% errors, threshold-based (>500ms) |
| Manual instrumentation everywhere | "Instrument every function for complete visibility" | Creates noise, performance overhead, maintenance burden. Over-instrumentation adds 15-20% latency | Auto-instrument framework/common libraries + selective manual spans for critical business logic only |
| Unbounded cardinality attributes | "Store user IDs, timestamps, full URLs in tags" | Explodes cardinality, makes queries slow, increases storage costs exponentially | Use bounded attributes: route patterns not full URLs, error types not messages, status codes not IDs |
| Full request/response body capture | "Store complete payloads for debugging" | Storage explosion, PII concerns, rarely needed. 1KB payload × 1M requests = 1GB | Store body hash for matching + sanitized params. Full body only for errors |
| Continuous profiling (always-on) | "Profile production 24/7 for complete picture" | High CPU overhead, generates data faster than you can analyze. Not needed for sporadic load spikes | Threshold-based profiling: only profile when conditions met (high load, slow response, errors) |
| Real-time dashboards | "Live updating graphs look impressive" | For root cause analysis, you're looking backward, not live monitoring. Adds polling/WebSocket complexity | Batch analysis: process data periodically, generate reports for timeframe of interest |
| Universal instrumentation | "Monitor every technology in the stack identically" | Each layer needs different approach. PHP needs different hooks than Postgres | Layer-specific profiling: PHP extension for app, pg_stat_statements for DB, separate tools optimized per layer |
| AI-powered everything | "Use AI for root cause analysis from day one" | AI needs patterns/baseline data. With greenfield system, you don't have training data. Adds complexity | Manual analysis first to understand patterns, add AI later when you have data |

## Feature Dependencies

```
Request metadata
    └──requires──> Transaction tracing
                       └──requires──> Function-level timing
                                          └──requires──> Instrumentation hooks

Database query capture
    └──enhances──> Transaction tracing
    └──enables──> Slow query correlation
                       └──requires──> Function-level timing

Distributed tracing correlation
    └──requires──> Transaction tracing (PHP side)
    └──requires──> Query capture with trace ID (DB side)
    └──requires──> Correlation storage/query capability

Lock detection
    └──requires──> Database query capture
    └──requires──> pg_stat_activity monitoring
    └──enhances──> Transaction blocking visualization

Timeline view
    └──requires──> Function-level timing
    └──requires──> Transaction tracing
    └──requires──> Database query capture

Query plan analysis
    └──requires──> Slow query correlation
    └──requires──> Database connection capability

Hot path detection
    └──requires──> Function-level timing
    └──requires──> Aggregation capability across multiple traces
```

### Dependency Notes

- **Transaction tracing is foundation**: Nearly everything builds on the ability to trace a request from start to finish
- **Timing data before visualization**: Must collect timing before you can display it (obvious but critical to phase ordering)
- **Correlation requires both sides**: Distributed tracing needs instrumentation at both PHP and Postgres layers + correlation storage
- **Lock detection needs real-time DB access**: Can't rely on PHP-side data alone; must query pg_locks during trace collection
- **Aggregation features need data volume**: Hot path detection, anomaly detection require collecting multiple traces before they're useful

## MVP Definition

### Launch With (v1) - Root Cause Discovery

Minimum viable product for investigating PHP load spikes.

- [ ] **Function-level timing** — Identify which PHP functions consume time
- [ ] **Transaction tracing** — Full request lifecycle with unique ID
- [ ] **Database query capture** — Log SQL queries with timing and trace correlation
- [ ] **Request metadata** — Capture URL, headers, POST/GET for context
- [ ] **Memory usage per request** — Track memory consumption
- [ ] **Threshold-based profiling** — Only profile requests >500ms
- [ ] **Timeline view** — Visual waterfall showing execution flow
- [ ] **Distributed trace correlation** — Link PHP trace ID to SQL queries
- [ ] **Basic search/filter** — Find traces by URL, duration, timestamp
- [ ] **PostgreSQL query monitoring** — pg_stat_activity snapshot collection
- [ ] **Lock detection** — Query pg_locks during slow requests

**Rationale**: This set allows you to answer "What happened during that load spike?" with code-level and database-level visibility. Focuses on data collection and correlation, not fancy visualization or AI.

### Add After Initial Investigation (v1.x)

Features to add once you've identified patterns in initial data.

- [ ] **Slow query correlation** — When investigating specific queries, link them back to originating PHP code (trigger: "Which code called this query?")
- [ ] **Transaction blocking visualization** — When lock issues identified, visualize blocking chains (trigger: locks found in initial data)
- [ ] **Query plan analysis** — When slow queries found, automatically run EXPLAIN (trigger: queries consistently >1s)
- [ ] **Hot path detection** — After collecting ~1000+ traces, identify most-executed expensive code paths (trigger: enough data for patterns)
- [ ] **Comparative analysis** — Compare problematic requests against normal baseline (trigger: need to understand "why this request specifically?")
- [ ] **Function-level memory profiling** — When memory issues suspected, drill into per-function memory (trigger: memory usage anomalies in v1 data)

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Automatic anomaly detection** — Requires historical baseline; defer until you have weeks of data
- [ ] **Code-level recommendations** — Needs pattern recognition across many traces; defer until you have diverse dataset
- [ ] **Request replay** — Useful for ongoing debugging but not for initial investigation; defer until tool is used continuously
- [ ] **Background job profiling** — CLI/queue worker profiling; defer unless investigation reveals background jobs as culprit
- [ ] **Real-time alerting** — Not needed for root cause analysis; defer until tool shifts from investigation to monitoring role
- [ ] **Advanced sampling strategies** — Simple threshold profiling sufficient initially; defer tail-based sampling until production-ready

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Reason |
|---------|------------|---------------------|----------|--------|
| Function-level timing | HIGH | MEDIUM | P1 | Core capability - can't analyze without knowing what's slow |
| Transaction tracing | HIGH | MEDIUM | P1 | Foundation for correlation and analysis |
| Database query capture | HIGH | MEDIUM | P1 | SQL is most common bottleneck in PHP apps |
| Distributed trace correlation | HIGH | HIGH | P1 | Gold mine for root cause - links code to DB activity |
| Request metadata | HIGH | LOW | P1 | Context essential for pattern identification |
| Timeline view | HIGH | MEDIUM | P1 | Visual analysis critical for understanding execution flow |
| Threshold profiling | HIGH | LOW | P1 | Reduces overhead/storage, focuses on problem requests |
| Memory usage per request | MEDIUM | LOW | P1 | Memory issues common in PHP, cheap to collect |
| Lock detection | HIGH | MEDIUM | P1 | Critical for your load spike investigation - locks cascade |
| Search and filter | HIGH | MEDIUM | P1 | Can't use tool without ability to find specific traces |
| Slow query correlation | HIGH | MEDIUM | P2 | Valuable but needs P1 data first |
| Transaction blocking viz | HIGH | HIGH | P2 | Useful when locks confirmed as issue |
| Query plan analysis | MEDIUM | MEDIUM | P2 | Helps understand query performance but not essential for first analysis |
| Hot path detection | MEDIUM | MEDIUM | P2 | Needs data volume before useful |
| Comparative analysis | MEDIUM | MEDIUM | P2 | Nice for understanding anomalies but manual comparison works initially |
| Function memory profiling | MEDIUM | MEDIUM | P2 | Drill-down feature, use only if v1 data suggests memory issue |
| Code recommendations | LOW | HIGH | P3 | AI/ML feature, needs training data and pattern library |
| Request replay | LOW | MEDIUM | P3 | Development convenience, not needed for investigation |
| Anomaly detection | MEDIUM | HIGH | P3 | Requires baseline data, high complexity |
| Background job profiling | LOW | MEDIUM | P3 | Out of scope unless investigation reveals need |
| Real-time alerting | LOW | MEDIUM | P3 | Not needed for root cause analysis workflow |

**Priority key:**
- P1: Must have for initial investigation (launch with these)
- P2: Should have after patterns emerge (add when triggered)
- P3: Nice to have in mature product (defer until post-investigation)

## Competitor Feature Analysis

Based on research of New Relic, Datadog, SigNoz, and other APM tools in 2026:

| Feature | New Relic | Datadog | SigNoz | Your Approach |
|---------|-----------|---------|--------|---------------|
| Auto-instrumentation | Full (agent-based) | Full (agent-based) | Full (OpenTelemetry) | Manual (PHP extension) - targeted to your needs |
| Transaction tracing | Yes | Yes | Yes | Yes - essential |
| Distributed tracing | Yes (full stack) | Yes (full stack) | Yes (OTEL) | Yes - but PHP + Postgres focus only |
| Database monitoring | Yes (separate product) | Yes (separate DBM) | Yes (integrated) | Yes - integrated, Postgres-specific |
| Lock detection | Basic | Advanced (DBM) | Basic | Advanced - critical for investigation |
| Code-level visibility | Deep (profiler) | Deep (continuous profiler) | Function-level | Function-level - sufficient |
| Query correlation | Yes | Yes | Yes | Yes - with backtrace |
| Timeline/waterfall | Yes | Yes | Yes | Yes - essential for analysis |
| AI root cause analysis | Yes (advanced) | Yes (AI-powered) | No | No - manual analysis with good data |
| Real-time alerting | Yes (core feature) | Yes (core feature) | Yes | No - not needed for root cause analysis |
| Sampling strategies | Multiple modes | Advanced (tail-based) | Basic | Threshold-based only - simpler |
| Query plan analysis | Yes | Yes (EXPLAIN) | No | Yes - EXPLAIN for slow queries |
| Memory profiling | Yes (heap analyzer) | Yes (continuous) | Basic | Request-level sufficient initially |
| Infrastructure monitoring | Yes (full stack) | Yes (extensive) | Yes | System metrics only - focused scope |
| Cost model | Per-user + data | Modular pricing | Open source | N/A - internal tool |

**Our differentiation**:
- No universal instrumentation - targeted PHP + Postgres only
- No real-time monitoring - root cause analysis workflow
- Deep lock detection - enterprise APMs treat this as basic, we make it advanced
- Integrated correlation - don't need separate products for APM and DBM
- Threshold-based simplicity - no complex sampling strategies
- Investigation-focused - not ongoing monitoring platform

## Data Collection Specifications

### PHP Agent Must Collect

For each profiled request (>500ms):

**Transaction data:**
- Unique trace ID (UUID)
- Request start/end timestamp (microsecond precision)
- Total duration (ms)
- HTTP method, URL, route pattern
- Status code
- Headers (selected: User-Agent, X-Forwarded-For, etc.)
- GET/POST parameters (sanitized)
- Session ID (hashed)

**Function-level data:**
- Function name (including class/namespace)
- Entry/exit timestamp (microsecond precision)
- Duration (ms)
- Memory usage before/after (bytes)
- Call depth (stack position)
- Parent function
- Return value type (not value itself)

**SQL query data:**
- Query text (with literals replaced by placeholders for grouping)
- Query duration (ms)
- Rows affected/returned
- Timestamp when executed
- Trace ID (for correlation)
- Backtrace (function that triggered query)

**Error data:**
- Error level (E_ERROR, E_WARNING, etc.)
- Error message
- File and line number
- Stack trace
- Context (local variables at error point)

### Database Agent Must Collect

For each SQL query with matching trace ID:

**From pg_stat_activity:**
- PID
- Query text
- Query start time
- State (active, idle in transaction, etc.)
- Wait event type/name
- Backend start time

**From pg_locks:**
- Lock type (relation, tuple, transaction, etc.)
- Lock mode (AccessShareLock, RowExclusiveLock, etc.)
- Granted (true/false)
- PID holding lock
- PID waiting for lock

**Query statistics:**
- Query duration (from pg_stat_statements if available)
- Blocks read/hit (cache efficiency)
- Rows returned/affected
- Temp files created (indicates work_mem issues)

**Query plan (for slow queries):**
- EXPLAIN output (JSON format)
- Estimated vs actual rows
- Scan types (seq scan, index scan, etc.)
- Join methods
- Cost estimates

### System Metrics Collection

At 10-second intervals during profiling window:

**CPU:**
- Overall CPU usage (%)
- User vs system time
- Load average (1, 5, 15 min)
- Per-process CPU (PHP-FPM, Postgres)

**Memory:**
- Total/available RAM
- Used/cached/buffered
- Swap usage
- Per-process memory (RSS, VMS)

**Disk I/O:**
- Reads/writes per second
- Throughput (MB/s)
- I/O wait time (%)
- Disk queue depth

**Network:**
- Bytes in/out
- Connections active
- Connection state distribution

## What Makes Good APM for Root Cause Analysis

Based on 2026 industry practices and research findings:

### Essential Characteristics

1. **Depth over breadth**: Code-level visibility into PHP + database-level visibility into Postgres beats surface-level monitoring of 20 technologies
2. **Correlation is king**: Linking PHP execution → SQL query → database lock is more valuable than any individual metric
3. **Context preservation**: Trace must include enough metadata to reproduce or understand the scenario
4. **Selective profiling**: Threshold-based collection (>500ms) reduces overhead while capturing problems
5. **Visual analysis**: Waterfall timeline more useful than raw metric tables for humans investigating issues

### Characteristics to Avoid

1. **Monitoring theater**: Real-time dashboards that look impressive but don't help find root causes
2. **Data drowning**: Collecting everything creates analysis paralysis - focus on high-value signals
3. **Premature AI**: Without baseline data, AI/ML adds complexity without value
4. **Unbounded cardinality**: Storing high-cardinality data (user IDs, timestamps) explodes storage and query costs
5. **Universal instrumentation**: Trying to profile everything adds overhead without proportional value

### Critical Success Factors

1. **Low overhead**: <5% performance impact on profiled requests, near-zero on unprofiled requests
2. **Storage efficiency**: Focused data collection keeps storage manageable for years of data
3. **Query performance**: Must be able to search 100K+ traces in <1 second
4. **Correlation reliability**: Trace ID propagation must work 100% of time or tool becomes unreliable
5. **Actionable output**: Every feature should answer "what's the next step?" not just "interesting data"

## Sources

**APM Ecosystem and Features (2026):**
- [Top APM Tools in 2026: What Every Developer Should Know](https://dev.to/olivia_madison_b0ad7090ad/top-apm-tools-in-2026-what-every-developer-and-engineering-team-should-know-1dg0)
- [What is APM? - Dynatrace](https://www.dynatrace.com/news/blog/what-is-apm/)
- [Top 15 Application Performance Monitoring Metrics](https://www.atatus.com/blog/top-apm-metrics-for-developers-and-sres/)
- [Application Performance Monitoring (APM) - Datadog](https://www.datadoghq.com/product/apm/)

**APM Tool Comparisons:**
- [Datadog vs. New Relic: Comparison for 2026](https://betterstack.com/community/comparisons/datadog-vs-newrelic/)
- [New Relic vs DataDog - Features, Pricing, Performance](https://signoz.io/blog/datadog-vs-newrelic/)
- [Datadog vs. New Relic: Key Features Overview](https://sematext.com/blog/datadog-vs-new-relic/)

**PHP APM Specifics:**
- [Best PHP Application Monitoring Tools in 2026](https://betterstack.com/community/comparisons/php-application-monitoring-tools/)
- [PHP Performance Monitoring & Analytics - Datadog](https://www.datadoghq.com/monitoring/php-performance-monitoring/)
- [Top 7 PHP Performance Bottlenecks and Monitoring](https://dev.to/olivia_madison_b0ad7090ad/top-7-php-performance-bottlenecks-and-how-to-monitor-them-2o56)

**Distributed Tracing and Correlation:**
- [12 Best Distributed Tracing Tools for 2026](https://www.dash0.com/comparisons/best-distributed-tracing-tools)
- [Top 15 Distributed Tracing Tools for Microservices](https://signoz.io/blog/distributed-tracing-tools/)
- [Complete Guide to Distributed Tracing - New Relic](https://newrelic.com/blog/apm/distributed-tracing-guide)

**Database Monitoring:**
- [Top 10 PostgreSQL Monitoring Tools (2026 Guide)](https://signoz.io/comparisons/postgresql-monitoring-tools/)
- [PostgreSQL Monitoring - Lock Monitoring](https://wiki.postgresql.org/wiki/Lock_Monitoring)
- [Best PostgreSQL Monitoring Tools & Key Metrics](https://sematext.com/blog/postgresql-monitoring/)

**APM Best Practices and Anti-Patterns:**
- [APM Best Practices: Dos and Don'ts Guide - Elastic](https://www.elastic.co/blog/apm-best-practices)
- [7 APM Tools Cost Optimization Strategies](https://www.optiapm.com/blog/7-apm-tools-cost-optimization-strategies-for-enterprise)
- [The APM Paradox: Too Much Data, Too Few Answers](https://www.honeybadger.io/blog/apm-paradox/)

**Root Cause Analysis:**
- [What is APM - Implementation and Best Practices - SigNoz](https://signoz.io/guides/what-is-apm/)
- [What is APM and How is Related to Root-Cause Analysis](https://www.eginnovations.com/blog/apm-analytics-and-root-cause-analysis/)
- [APM in 2026: The New Standard for Business Reliability](https://www.atatus.com/blog/apm-for-business-growth/)

---
*Feature research for: Bitville APM - PHP Load Spike Investigation*
*Researched: 2026-01-27*
*Confidence: HIGH (verified across multiple authoritative sources including major APM vendors, industry comparisons, and best practices documentation)*
