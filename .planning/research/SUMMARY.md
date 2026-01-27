# Project Research Summary

**Project:** Bitville APM & Centralized Logging
**Domain:** Application Performance Monitoring (APM) for PHP 7.4 Applications with Database Correlation
**Researched:** 2026-01-27
**Confidence:** HIGH

## Executive Summary

This project aims to build a custom APM system for investigating PHP load spikes on 3 web servers (PHP 7.4.33) connected to a PostgreSQL database. Expert APM systems follow a three-tier architecture: distributed agents collect profiling data, a central listener aggregates and correlates events, and a log sink (Graylog) provides long-term storage. The recommended approach uses XHProf for function-level profiling, pg_stat_statements for database monitoring, UDP sockets for fire-and-forget agent communication, and correlation IDs to link PHP execution to database queries.

The critical success factor is maintaining production safety: profiling must never cause application failures. This requires non-blocking I/O with strict 50ms timeouts, threshold-based profiling (only requests >500ms), and circuit breakers to fail gracefully when the listener is unavailable. The system should use an agent-daemon split pattern where PHP extensions send data to local daemon processes via Unix sockets, and daemons batch and forward to the central listener asynchronously.

Key risks include observer effect (profiling itself causing slowdowns), memory leaks in long-running daemons, blocking I/O propagating listener failures to the application, and trace correlation failure between PHP and database layers. These can be mitigated through sampling profilers, worker restart policies, non-blocking sockets with timeouts, and injecting correlation IDs into SQL queries via application_name parameters.

## Key Findings

### Recommended Stack

The research converged on a pragmatic stack optimized for PHP 7.4 legacy environments with production safety as the top priority. Core decisions favor proven, low-overhead technologies over cutting-edge solutions.

**Core technologies:**
- **XHProf (longxinH fork)**: Function-level profiling — revitalized PECL extension with modern timer APIs, supports PHP 7.2-8.2, proven at scale with 5-10% overhead
- **pg_stat_statements + pg_stat_activity**: Database monitoring — built-in PostgreSQL extensions provide query performance tracking and real-time connection visibility with zero installation overhead
- **UDP sockets (native PHP)**: Agent-listener communication — non-blocking fire-and-forget semantics prevent blocking requests, no external dependencies
- **graylog2/gelf-php 1.x**: GELF message formatting — official library for forwarding to Graylog, v1.x supports PHP 7.4
- **SQLite 3.40+**: Central listener storage — zero admin embedded database sufficient for 7-day buffering and query before Graylog forward
- **Native /proc filesystem**: System metrics — direct reads from /proc/stat, /proc/meminfo provide CPU, memory, load data with zero overhead

**Version compatibility critical for PHP 7.4.33:**
- graylog2/gelf-php must use 1.7.x branch (v2.x requires PHP 8.0+)
- XHProf longxinH fork explicitly supports PHP 7.4
- Avoid Tideways XHProf fork (archived project)

### Expected Features

Research across major APM vendors (New Relic, Datadog, SigNoz) reveals clear feature hierarchy.

**Must have (table stakes):**
- Function-level timing and traces — core APM requirement for identifying slow code paths
- Transaction tracing — end-to-end request visibility with unique trace ID
- Database query capture — SQL queries are the most common bottleneck in web apps
- Error and exception tracking — users expect to see what broke and where
- Timeline/waterfall view — visual representation of execution flow is critical for identifying bottlenecks
- Threshold-based profiling — only profile requests >500ms to reduce overhead and storage
- Request metadata (URL, method, headers) — context essential for understanding performance patterns

**Should have (competitive):**
- Distributed trace correlation — link PHP function → SQL query → pg_stat_activity, gold mine for root cause analysis
- Lock detection and tracking — identify database locks causing request delays, critical for cascading lock investigation
- Slow query correlation — link SQL queries to the PHP code that triggered them with backtrace
- Query plan analysis — capture EXPLAIN output for slow queries to identify missing indexes
- Hot path detection — aggregate function call data to find optimization targets

**Defer (v2+):**
- Automatic anomaly detection — requires historical baseline data (weeks of collection)
- Code-level recommendations — needs pattern recognition across many traces
- Request replay capability — useful for ongoing debugging but not initial investigation
- Background job profiling — CLI/queue worker profiling, defer unless investigation reveals need
- Real-time alerting — not needed for root cause analysis workflow, only for ongoing monitoring

**Anti-features to avoid:**
- 100% profiling without sampling — massive 15-20% overhead, storage explosion, analysis paralysis
- Manual instrumentation everywhere — creates noise and maintenance burden
- Continuous always-on profiling — high CPU overhead, generates data faster than you can analyze
- Real-time dashboards — for root cause analysis, you're looking backward not live

### Architecture Approach

APM systems follow a proven three-tier architecture separating data collection, aggregation, and forwarding. This prevents coupling between agents and sinks while providing buffering and resilience.

**Major components:**

1. **PHP Agent (Daemon + Extension)** — Two-part architecture where PHP extension handles instrumentation with minimal overhead (<50ms), separate daemon process handles buffering and network I/O. Extension sends via Unix socket (non-blocking), daemon batches and forwards via HTTP. This follows New Relic and Datadog's proven agent design.

2. **Postgres Agent (Daemon)** — Standalone daemon queries pg_stat_activity every 100ms to capture active queries, parses PostgreSQL logs, connects to pg_stat_statements for historical data. Correlates queries with PHP trace IDs via application_name matching.

3. **Central Listener (Receiver-Processor-Exporter)** — Single service with HTTP receivers, in-memory batching, SQLite for 7-day retention, and GELF exporter to Graylog. Follows OpenTelemetry Collector component model: receivers handle protocols, processors transform/correlate data, exporters handle output formats.

4. **Correlation ID Propagation** — Generate UUID at request entry (PHP), propagate via $_ENV['REQUEST_ID'], inject into Postgres connection via application_name parameter. Central listener joins events by correlation ID to create unified view of request → code → database.

5. **Buffering Strategy** — Agents use memory buffer (fast path) + disk overflow (SQLite or flat files) with bounded sizes to prevent memory exhaustion. Listener stores 7 days in SQLite for replay/debugging. Circuit breakers prevent wasting resources on failing downstream systems.

**Key architectural decisions:**
- Push-based data flow (agents → listener) with local buffering for resilience
- Non-blocking I/O throughout with strict timeouts (50ms at socket level)
- Receiver-Processor-Exporter pipeline for modularity
- Correlation via UUID propagated through all layers
- Agent-daemon split for production safety (daemon crash doesn't kill app)

### Critical Pitfalls

Research revealed seven critical failure modes with proven recovery strategies:

1. **Observer Effect (Profiling Causing Performance Degradation)** — Profilers add 15-20% latency when over-instrumented. Use sampling profilers (Excimer) or whitelist-profiling mode, implement adaptive sampling (1-10% rate), set strict overhead budgets (<50ms per request), monitor the monitor itself. Address in Phase 1 as foundational safety requirement.

2. **Memory Leaks in Long-Running Daemons** — PHP designed for short-lived requests, not long-running processes. Circular references accumulate without explicit gc_collect_cycles(). Implement worker restart policies (100-1,000 requests per daemon), use supervisord for respawn, enable gc_enable() and periodic gc_collect_cycles(), monitor memory as stopping condition. Address in Phase 2 as architectural decision.

3. **Blocking I/O Causing Application Failures** — Default socket operations block, propagating listener failures to application. Use non-blocking sockets (socket_set_nonblock), implement send timeouts at socket level (SO_SNDTIMEO=50ms), circuit breaker after 3 failures, fallback to file buffering. Test explicitly: kill listener, verify app continues. Address in Phase 1 as safety requirement.

4. **Data Volume Overwhelming Listener (Backpressure Cascade)** — High-traffic apps generate profiling data faster than listener can process. Implement adaptive sampling (target 10 traces/sec), head-based sampling decisions, rate limiting at agent (max 100 traces/sec), compress data (gzip 5-10x reduction), scale listeners horizontally. Address in Phase 3 during pipeline design.

5. **Trace Correlation Failure Between PHP and Database** — Cannot connect slow queries to requests without correlation IDs. Inject trace context into SQL comments, use application_name connection parameter to pass trace ID, log trace ID in pg_stat_activity. Address in Phase 4 when instrumenting database calls.

6. **Production Safety Violation (Profiler Crashes App)** — C extensions run in same process space, memory safety errors cause segfaults. Run profiler in separate process space (daemon outside PHP-FPM), implement watchdog timeout (50ms), circuit breaker auto-disables after error rate increase, gradual rollout (0.1% → 1% → 10%). Address in Phase 1 as foundational requirement.

7. **PHP 7.4 Legacy Compatibility** — PHP 7.4 EOL November 2022, most tools focus on PHP 8.0+. Use Zend Extended Support (available through Dec 2026), prefer pure PHP solutions over C extensions, choose tools explicitly compatible with PHP 7.4, test against PHP 8.0+ in CI to ensure upgrade path. Address in Phase 1 during technology selection.

## Implications for Roadmap

Based on combined research findings, the recommended phase structure prioritizes production safety and correlation capabilities:

### Phase 1: Core Instrumentation & Safety
**Rationale:** Production safety is non-negotiable and must be foundational, not retrofitted. Profiling infrastructure without safety mechanisms will cause production incidents.

**Delivers:** PHP profiling agent with non-blocking communication, circuit breakers, overhead budgeting, and graceful failure modes.

**Addresses:**
- Function-level timing (table stakes feature)
- Threshold-based profiling (>500ms only)
- Request metadata capture
- Production safety requirement (never cause app failures)

**Avoids:**
- Observer effect (Pitfall 1) — sampling and overhead monitoring from day one
- Blocking I/O failures (Pitfall 3) — non-blocking sockets with 50ms timeout
- Production crashes (Pitfall 6) — agent-daemon split, separate process space
- PHP 7.4 incompatibility (Pitfall 7) — technology choices vetted for 7.4.33

**Stack elements:** XHProf (longxinH), native UDP sockets, ext-sockets

### Phase 2: Daemon Architecture & Lifecycle
**Rationale:** Long-running daemon processes need explicit lifecycle management to prevent memory leaks and resource exhaustion. Build worker restart policies before the daemon runs in production.

**Delivers:** Agent daemon with memory monitoring, graceful shutdown, buffer management, and supervisor integration.

**Addresses:**
- Local buffering (memory + disk overflow)
- Worker restart policies (memory threshold)
- Graceful shutdown (SIGTERM handling)
- Supervisor integration (systemd/supervisord)

**Avoids:**
- Memory leaks (Pitfall 2) — gc_enable, memory thresholds, periodic restart
- Socket reliability issues — Unix socket lifecycle management
- Resource descriptor exhaustion — explicit connection cleanup

**Architecture components:** Agent daemon with buffer.go, forwarder.go, lifecycle management

### Phase 3: Central Listener & Data Pipeline
**Rationale:** Centralized collection provides single aggregation point and enables correlation. Design for data volume from the start to avoid backpressure issues during load spikes.

**Delivers:** Central listener with HTTP receivers, batching, SQLite storage, and basic GELF export.

**Addresses:**
- Centralized collection point
- 7-day local retention (SQLite)
- Batching and compression
- Basic forwarding to Graylog

**Avoids:**
- Data volume overwhelming (Pitfall 4) — adaptive sampling, rate limiting, compression
- Backpressure cascade — bounded buffers, HTTP 503 responses when full
- Listener crashes — SQLite persistence for replay

**Architecture components:** Receiver-Processor-Exporter pipeline, SQLite storage

**Stack elements:** graylog2/gelf-php 1.x, SQLite 3.40+, GELF over TCP

### Phase 4: Database Monitoring & Correlation
**Rationale:** Linking PHP execution to database queries is the gold mine for root cause analysis. Correlation must be designed upfront; timestamp-based correlation fails under concurrency.

**Delivers:** Postgres agent with pg_stat_activity polling, correlation ID matching, and joined PHP+DB events in central listener.

**Addresses:**
- Database query capture (table stakes)
- Distributed trace correlation (competitive advantage)
- Lock detection via pg_locks queries
- Query correlation to PHP code

**Avoids:**
- Trace correlation failure (Pitfall 5) — application_name injection, SQL comment tags
- Timestamp ambiguity — UUID-based correlation, not timestamps
- Connection pooling issues — per-request connection tagging

**Architecture components:** Postgres agent collectors, correlation processor in listener

**Stack elements:** pg_stat_statements, pg_stat_activity, native /proc reads

### Phase 5: Visualization & Query Interface
**Rationale:** Raw data is useless without ability to search, filter, and visualize. Timeline view is critical for human analysis of execution flow.

**Delivers:** Timeline/waterfall visualization, search and filter capability, basic dashboard.

**Addresses:**
- Timeline view (table stakes)
- Search and filter traces
- Query interface for ad-hoc investigation

**Dependencies:** Requires Phases 1-4 data collection to be complete

### Phase 6: Advanced Features & Optimization
**Rationale:** After core functionality proves valuable, add differentiating features identified during initial investigation.

**Delivers:** Slow query correlation with backtrace, query plan analysis (EXPLAIN), hot path detection, comparative analysis.

**Addresses:**
- Slow query correlation (competitive feature)
- Query plan analysis for missing indexes
- Hot path detection (requires aggregation across traces)
- Function-level memory profiling (if memory issues found)

**Deferred to v2+:** Anomaly detection, code recommendations, request replay, background job profiling

### Phase Ordering Rationale

- **Safety first:** Phase 1 establishes production safety. No amount of features justifies causing application failures.
- **Lifecycle before scale:** Phase 2 addresses daemon lifecycle before volume becomes an issue. Memory leaks are architectural, not operational.
- **Collection before correlation:** Phase 3 proves data collection works before adding correlation complexity in Phase 4.
- **Data before visualization:** Phases 1-4 collect data, Phases 5-6 make it useful. Can't visualize what you haven't captured.
- **Pitfall alignment:** Each phase explicitly addresses 1-2 critical pitfalls from research, ensuring prevention not remediation.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2:** Worker lifecycle management — research supervisord/systemd patterns, memory profiling tools (php-memory-profiler)
- **Phase 4:** Postgres query correlation — research pg_stat_activity polling patterns, application_name injection approaches, SQL comment parsing
- **Phase 5:** Timeline visualization — research waterfall rendering libraries, trace query optimization patterns

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Profiling instrumentation — XHProf documentation is comprehensive, pattern well-established
- **Phase 3:** HTTP receivers and buffering — standard OpenTelemetry Collector patterns, well-documented
- **Phase 6:** Advanced query features — defer until triggered by findings from Phases 1-5

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified with official docs and 2025-2026 sources. XHProf, pg_stat_statements, and GELF are mature technologies with extensive production use. PHP 7.4 compatibility explicitly verified for all components. |
| Features | HIGH | Feature hierarchy validated across New Relic, Datadog, SigNoz, and multiple APM comparisons. Table stakes vs differentiators clear from industry consensus. Anti-features backed by real-world APM pitfall documentation. |
| Architecture | HIGH | Three-tier architecture (agent-listener-sink) is industry standard across all major APM vendors. Agent-daemon split pattern proven by New Relic and Datadog. Correlation ID propagation follows W3C Trace Context standard. |
| Pitfalls | HIGH | All seven critical pitfalls verified with multiple authoritative sources from 2025-2026. Observer effect, memory leaks, and blocking I/O are well-documented PHP profiling challenges with proven solutions. |

**Overall confidence:** HIGH

Research drew from official vendor documentation (New Relic, Datadog, Elastic), authoritative industry sources (OpenTelemetry, W3C standards), and recent technical articles (2025-2026) specifically addressing PHP 7.4 profiling, APM best practices, and distributed tracing. Stack recommendations are pragmatic choices with proven production track records, not cutting-edge experiments.

### Gaps to Address

While overall confidence is high, several areas need validation during implementation:

- **PHP 7.4 XHProf overhead in production:** Research indicates 5-10% overhead but this varies by application. Phase 1 must include load testing to measure actual overhead on Bitville's codebase before enabling in production.

- **SQLite write throughput at scale:** Research suggests 10K-50K writes/sec on SSD with WAL mode, but this assumes specific hardware. Phase 3 should validate SQLite performance on actual listener server before committing to it vs. VictoriaMetrics migration path.

- **Correlation ID propagation reliability:** Application_name injection via pg_connect() is the recommended approach but needs validation that connection pooling doesn't break per-request tagging. Phase 4 should prototype correlation before building full instrumentation.

- **UDP packet loss acceptability:** Research indicates ~0.1% typical packet loss for APM metrics is acceptable, but this assumes certain network conditions. Phase 1 should measure actual packet loss in Bitville's datacenter and implement TCP fallback if loss exceeds 1%.

- **Sampling strategy effectiveness:** Adaptive sampling (1-10% + always profile >500ms) is recommended but "slow request" threshold may need tuning for Bitville's specific traffic patterns. Phase 3 should implement configurable thresholds and monitor coverage during initial deployment.

- **Graylog GELF ingestion rate limits:** Research doesn't specify Graylog's throughput limits. Phase 3 should load test GELF forwarding to understand when Graylog becomes bottleneck and circuit breaker thresholds need adjustment.

## Sources

### Primary (HIGH confidence)

**Stack Research:**
- [GitHub: longxinH/xhprof](https://github.com/longxinH/xhprof) — Official revitalized PECL XHProf, verified 2024-07-09 release
- [PostgreSQL Documentation: pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) — Official PostgreSQL extension docs
- [Packagist: graylog2/gelf-php](https://packagist.org/packages/graylog2/gelf-php) — Official GELF library, verified 2025-01-20 v2.0.2 release
- [Graylog: GELF Inputs](https://go2docs.graylog.org/current/getting_in_log_data/gelf.html) — Official GELF format specification

**Features Research:**
- [Datadog: Application Performance Monitoring](https://www.datadoghq.com/product/apm/) — Industry-leading APM feature set
- [New Relic: Distributed Tracing Guide](https://newrelic.com/blog/apm/distributed-tracing-guide) — Comprehensive distributed tracing practices
- [SigNoz: What is APM](https://signoz.io/guides/what-is-apm/) — Modern APM implementation guide
- [Atatus: Top APM Metrics](https://www.atatus.com/blog/top-apm-metrics-for-developers-and-sres/) — Essential APM metrics

**Architecture Research:**
- [Datadog: Agent Architecture](https://docs.datadoghq.com/agent/architecture/) — Production-proven agent design
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) — Industry standard telemetry pipeline
- [New Relic: PHP Agent Introduction](https://docs.newrelic.com/docs/apm/agents/php-agent/getting-started/introduction-new-relic-php/) — PHP agent architecture
- [Bindplane: Resilient Telemetry Pipelines](https://bindplane.com/blog/how-to-build-resilient-telemetry-pipelines-with-the-opentelemetry-collector-high-availability-and-gateway-architecture) — High availability patterns

**Pitfalls Research:**
- [Medium: Profiling in Production Without Killing Performance (Jan 2026)](https://medium.com/@yashbatra11111/profiling-in-production-without-killing-performance-ebpf-continuous-profiling-5a92a8610769) — Observer effect mitigation
- [Medium: Debugging Memory Leaks in Long-Running Symfony Applications (Jan 2026)](https://medium.com/@laurentmn/debugging-memory-leaks-in-long-running-symfony-applications-d2e89b17a53d) — PHP daemon memory management
- [Datadog: Trace Sampling Use Cases](https://docs.datadoghq.com/tracing/guide/ingestion_sampling_use_cases/) — Sampling strategies
- [Wikimedia TechBlog: Profiling PHP in Production at Scale](https://techblog.wikimedia.org/2021/03/03/profiling-php-in-production-at-scale/) — Production profiling practices

### Secondary (MEDIUM confidence)

- [Tideways: The 6 Best PHP Profilers](https://tideways.com/the-6-best-php-profilers) — Profiler comparison
- [Better Stack: PHP Application Monitoring Tools 2026](https://betterstack.com/community/comparisons/php-application-monitoring-tools/) — Current APM landscape
- [SigNoz: PostgreSQL Monitoring Tools 2026](https://signoz.io/comparisons/postgresql-monitoring-tools/) — Database monitoring options
- [Elastic: APM Best Practices](https://www.elastic.co/blog/apm-best-practices) — Industry best practices

### Tertiary (LOW confidence, needs validation)

- [VictoriaMetrics Documentation](https://docs.victoriametrics.com/) — Alternative to SQLite if scaling needed
- [Excimer Profiler](https://github.com/wikimedia/mediawiki-php-excimer) — Alternative sampling profiler for PHP
- [Zend: Extended PHP Support](https://www.zend.com/services/php-long-term-support) — Commercial PHP 7.4 support option

---
*Research completed: 2026-01-27*
*Ready for roadmap: yes*
