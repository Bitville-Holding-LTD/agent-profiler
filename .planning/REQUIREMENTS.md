# Requirements: Bitville APM & Centralized Logging

**Defined:** 2026-01-27
**Core Value:** Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### PHP Agent - Core Instrumentation

- [x] **PHP-01**: Capture profiling data only for requests exceeding 500ms threshold
- [x] **PHP-02**: Generate unique correlation ID (UUID v4) at request start
- [x] **PHP-03**: Integrate XHProf for function-level timing breakdown
- [x] **PHP-04**: Collect request metadata (URL, method, headers, GET/POST variables, response time)
- [x] **PHP-05**: Collect memory usage per function (peak memory, allocations)
- [x] **PHP-06**: Capture all SQL queries executed during request with timing
- [x] **PHP-07**: Support configurable on/off toggles for each profiling feature via settings file
- [x] **PHP-08**: Inject project identifier (manual configuration in listener.php)

### PHP Agent - Communication & Safety

- [x] **COMM-01**: Send profiling data to listener daemon within 50ms timeout
- [x] **COMM-02**: Use non-blocking sockets with SO_SNDTIMEO at socket level
- [x] **COMM-03**: Skip silently if listener unreachable (never cause request failure)
- [ ] **COMM-04**: Implement circuit breaker pattern (auto-disable after consecutive failures)
- [ ] **COMM-05**: Run as background daemon process on each PHP web server
- [ ] **COMM-06**: Provide listener.php include file for PHP app integration
- [ ] **COMM-07**: Accept connections from PHP app via Unix socket or UDP

### PHP Agent - Daemon Lifecycle

- [ ] **DAEMON-01**: Implement worker restart policy based on memory threshold (256MB)
- [ ] **DAEMON-02**: Implement worker restart policy based on request count (100-1,000 requests)
- [ ] **DAEMON-03**: Enable garbage collection with periodic gc_collect_cycles()
- [ ] **DAEMON-04**: Handle graceful shutdown on SIGTERM
- [ ] **DAEMON-05**: Implement memory buffering for pending sends
- [ ] **DAEMON-06**: Implement disk overflow buffer when memory buffer full

### Postgres Agent - Data Collection

- [ ] **PG-01**: Query pg_stat_activity every minute for active queries and locks
- [ ] **PG-02**: Query pg_stat_statements for query performance statistics
- [ ] **PG-03**: Parse Postgres log files continuously for query logs
- [ ] **PG-04**: Collect system metrics (CPU, RAM, disk I/O) on DB server
- [ ] **PG-05**: Match correlation IDs from PHP via application_name parameter
- [ ] **PG-06**: Detect and report database locks and blocking queries
- [ ] **PG-07**: Never cause database failures or performance degradation

### Postgres Agent - Communication

- [ ] **PG-COMM-01**: Send collected data to listener server via HTTP POST
- [ ] **PG-COMM-02**: Implement local buffering for listener unavailability
- [ ] **PG-COMM-03**: Include project identifier with all sent data
- [ ] **PG-COMM-04**: Run as daemon service on DB server (5.9.121.222)

### Listener Server - Data Reception

- [ ] **LIST-01**: Receive profiling data from multiple PHP agents via HTTP/UDP
- [ ] **LIST-02**: Receive monitoring data from Postgres agent via HTTP
- [ ] **LIST-03**: Accept connections only from authorized servers (firewall configuration)
- [ ] **LIST-04**: Parse incoming data into structured format
- [ ] **LIST-05**: Correlate PHP requests with database activity via correlation ID

### Listener Server - Storage & Retention

- [ ] **STOR-01**: Store all data in SQLite database with WAL mode
- [ ] **STOR-02**: Implement 7-day automatic retention (auto-delete old records)
- [ ] **STOR-03**: Index by correlation ID, project, timestamp, duration for fast queries
- [ ] **STOR-04**: Support multi-project data separation and filtering

### Listener Server - Graylog Integration

- [ ] **GELF-01**: Forward all received data to Graylog in GELF format (TCP)
- [ ] **GELF-02**: Use graylog2/gelf-php 1.7.x for PHP 7.4 compatibility
- [ ] **GELF-03**: Implement circuit breaker for Graylog unavailability
- [ ] **GELF-04**: Buffer in SQLite during Graylog outages and replay when available
- [ ] **GELF-05**: Include project identifier in all GELF messages

### Listener Server - Query Interface

- [ ] **QUERY-01**: Provide basic web UI to view logs directly on listener
- [ ] **QUERY-02**: Implement search/filter API (by project, URL, duration, timestamp)
- [ ] **QUERY-03**: Display timeline visualization of request flow
- [ ] **QUERY-04**: Link PHP request traces to their SQL queries
- [ ] **QUERY-05**: Show comparative analysis (this request vs average)
- [ ] **QUERY-06**: Support filtering by project for multi-project deployments

### Configuration & Deployment

- [ ] **CFG-01**: Document firewall rules for PHP/DB servers → listener communication
- [ ] **CFG-02**: Provide installation scripts for PHP agent daemon
- [ ] **CFG-03**: Provide installation scripts for Postgres agent daemon
- [ ] **CFG-04**: Provide installation scripts for listener server
- [ ] **CFG-05**: Document listener.php integration in PHP applications
- [ ] **CFG-06**: Create settings file template for profiling feature toggles
- [ ] **CFG-07**: Document multi-project configuration (project name setup)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Analysis

- **ADV-01**: Hot path detection (identify most expensive code paths across requests)
- **ADV-02**: Anomaly detection (automatic identification of unusual patterns)
- **ADV-03**: Query plan capture and analysis for slow queries
- **ADV-04**: Distributed tracing across multiple services (if expanding beyond PHP)
- **ADV-05**: Real-time alerting when load spikes detected

### Optimization

- **OPT-01**: Migrate from SQLite to VictoriaMetrics for higher throughput (if >100K datapoints/minute)
- **OPT-02**: Implement adaptive sampling strategies based on load
- **OPT-03**: UDP transport for high-volume scenarios (with reliability layer)
- **OPT-04**: Compression (GZIP) for data transmission

### Enhanced Visualization

- **VIZ-01**: Flamegraph visualization of function call trees
- **VIZ-02**: Database query waterfall charts
- **VIZ-03**: Historical trend analysis dashboard
- **VIZ-04**: Exportable reports for load spike investigations

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time alerting system (v1) | Will use Graylog's alerting features; deferred to v2 |
| Historical data >7 days on listener | Graylog handles long-term storage; listener is short-term buffer |
| Profiling requests <500ms | Only slow requests need investigation; reduces overhead |
| Application code refactoring | Tool for finding problems, not fixing them |
| Multi-language support | PHP-specific tool for PHP-specific problem |
| Custom analysis dashboard (v1) | Will use Graylog UI + Claude/Cursor AI for initial analysis |
| Distributed tracing beyond single app | Single PHP app + single DB server for now |
| APM for non-PHP services | Scope limited to PHP/Postgres stack |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PHP-01 | Phase 1 | Pending |
| PHP-02 | Phase 1 | Pending |
| PHP-03 | Phase 1 | Pending |
| PHP-04 | Phase 1 | Pending |
| PHP-05 | Phase 1 | Pending |
| PHP-06 | Phase 1 | Pending |
| PHP-07 | Phase 1 | Pending |
| PHP-08 | Phase 1 | Pending |
| COMM-01 | Phase 1 | Pending |
| COMM-02 | Phase 1 | Pending |
| COMM-03 | Phase 1 | Pending |
| COMM-04 | Phase 2 | Pending |
| COMM-05 | Phase 2 | Pending |
| COMM-06 | Phase 2 | Pending |
| COMM-07 | Phase 2 | Pending |
| DAEMON-01 | Phase 2 | Pending |
| DAEMON-02 | Phase 2 | Pending |
| DAEMON-03 | Phase 2 | Pending |
| DAEMON-04 | Phase 2 | Pending |
| DAEMON-05 | Phase 2 | Pending |
| DAEMON-06 | Phase 2 | Pending |
| LIST-01 | Phase 3 | Pending |
| LIST-02 | Phase 3 | Pending |
| LIST-03 | Phase 3 | Pending |
| LIST-04 | Phase 3 | Pending |
| LIST-05 | Phase 3 | Pending |
| STOR-01 | Phase 3 | Pending |
| STOR-02 | Phase 3 | Pending |
| STOR-03 | Phase 3 | Pending |
| STOR-04 | Phase 3 | Pending |
| GELF-01 | Phase 4 | Pending |
| GELF-02 | Phase 4 | Pending |
| GELF-03 | Phase 4 | Pending |
| GELF-04 | Phase 4 | Pending |
| GELF-05 | Phase 4 | Pending |
| PG-01 | Phase 5 | Pending |
| PG-02 | Phase 5 | Pending |
| PG-03 | Phase 5 | Pending |
| PG-04 | Phase 5 | Pending |
| PG-05 | Phase 5 | Pending |
| PG-06 | Phase 5 | Pending |
| PG-07 | Phase 5 | Pending |
| PG-COMM-01 | Phase 5 | Pending |
| PG-COMM-02 | Phase 5 | Pending |
| PG-COMM-03 | Phase 5 | Pending |
| PG-COMM-04 | Phase 5 | Pending |
| QUERY-01 | Phase 6 | Pending |
| QUERY-02 | Phase 6 | Pending |
| QUERY-03 | Phase 6 | Pending |
| QUERY-04 | Phase 6 | Pending |
| QUERY-05 | Phase 6 | Pending |
| QUERY-06 | Phase 6 | Pending |
| CFG-01 | Phase 7 | Pending |
| CFG-02 | Phase 7 | Pending |
| CFG-03 | Phase 7 | Pending |
| CFG-04 | Phase 7 | Pending |
| CFG-05 | Phase 7 | Pending |
| CFG-06 | Phase 7 | Pending |
| CFG-07 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-27*
*Last updated: 2026-01-27 after initial definition*
