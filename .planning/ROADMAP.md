# Roadmap: Bitville APM & Centralized Logging

**Created:** 2026-01-27
**Milestone:** v1.0 - Initial Release
**Phases:** 7

## Overview

This roadmap delivers a production-grade APM system for investigating PHP 7.4 load spikes with database correlation. The system consists of PHP agent daemons, a Postgres monitoring agent, and a central listener that stores data locally and forwards to Graylog.

**Core Value:** Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average.

---

## Phase 1: PHP Agent Core Instrumentation & Safety

**Goal:** Users can capture profiling data for slow PHP requests without impacting application stability

**Requirements:** PHP-01, PHP-02, PHP-03, PHP-04, PHP-05, PHP-06, PHP-07, PHP-08, COMM-01, COMM-02, COMM-03

**Plans:** 6 plans

Plans:
- [x] 01-01-PLAN.md - Configuration system and correlation ID generator
- [x] 01-02-PLAN.md - XHProf integration for function-level profiling
- [x] 01-03-PLAN.md - SQL query capture via Phalcon events
- [x] 01-04-PLAN.md - Socket transmission with disk buffer fallback
- [x] 01-05-PLAN.md - Request metadata collection
- [x] 01-06-PLAN.md - listener.php orchestration and integration

**Success Criteria:**
1. Profiling data is captured only for PHP requests exceeding 500ms threshold
2. Each profiled request has unique correlation ID for database query matching
3. Function-level timing breakdown is collected via XHProf integration
4. Request metadata (URL, method, headers, variables, timing) is captured
5. Memory usage per request is tracked
6. All SQL queries executed during request are captured with timing
7. Profiling features can be toggled on/off via configuration file
8. Project identifier is included with all profiling data
9. Data transmission to listener completes within 50ms or skips silently
10. PHP application continues functioning normally even when listener is unreachable

**Deliverables:**
- XHProf integration module
- Request profiler with 500ms threshold detection
- Correlation ID generator (UUID v4)
- Request metadata collector
- Memory usage tracker
- SQL query capture hooks
- Configuration file parser for feature toggles
- Non-blocking socket communication layer with 50ms timeout
- listener.php include file for PHP app integration

**Dependencies:** None (foundation phase)

---

## Phase 2: PHP Agent Daemon Architecture & Lifecycle

**Goal:** PHP agent runs reliably as long-running daemon process with graceful lifecycle management

**Requirements:** COMM-04, COMM-05, COMM-06, COMM-07, DAEMON-01, DAEMON-02, DAEMON-03, DAEMON-04, DAEMON-05, DAEMON-06

**Plans:** 4 plans

Plans:
- [x] 02-01-PLAN.md - Daemon foundation (ReactPHP event loop, socket server, worker lifecycle)
- [x] 02-02-PLAN.md - Buffer management (memory buffer + disk overflow)
- [x] 02-03-PLAN.md - Circuit breaker & transmission (circuit breaker pattern + transmitter)
- [x] 02-04-PLAN.md - Integration & process management (supervisord/systemd, health check)

**Success Criteria:**
1. PHP agent runs as background daemon process on each web server
2. Daemon automatically restarts workers when memory usage exceeds 256MB threshold
3. Daemon automatically restarts workers after processing 100-1,000 requests
4. Garbage collection runs periodically to prevent memory leaks
5. Daemon handles graceful shutdown on SIGTERM signal
6. Pending profiling data is buffered in memory when listener is temporarily unavailable
7. Memory buffer overflow writes to disk buffer automatically
8. PHP application can communicate with daemon via Unix socket or UDP
9. Circuit breaker automatically disables profiling after consecutive failures
10. listener.php include file is available for PHP application integration

**Deliverables:**
- Daemon process manager (supervisord configuration or custom)
- Worker lifecycle management (memory/request thresholds)
- Garbage collection scheduler
- Signal handler for graceful shutdown (SIGTERM)
- Memory buffer implementation
- Disk overflow buffer implementation
- Unix socket server
- UDP socket server
- Circuit breaker implementation
- Monitoring/health check endpoint

**Dependencies:** Phase 1 (requires core profiling functionality)

---

## Phase 3: Central Listener Data Reception & Storage

**Goal:** Central server receives, stores, and correlates profiling data from multiple agents

**Requirements:** LIST-01, LIST-02, LIST-03, LIST-04, LIST-05, STOR-01, STOR-02, STOR-03, STOR-04

**Plans:** 4 plans

Plans:
- [x] 03-01-PLAN.md - Database foundation (Bun project, SQLite schema, WAL mode, prepared statements)
- [x] 03-02-PLAN.md - HTTP server with authentication and ingestion endpoints
- [x] 03-03-PLAN.md - Retention policy and systemd service configuration
- [x] 03-04-PLAN.md - UDP receiver and rate limiting

**Success Criteria:**
1. Listener accepts profiling data from multiple PHP agents via HTTP/UDP
2. Listener accepts monitoring data from Postgres agent via HTTP
3. Listener only accepts connections from authorized PHP and DB servers
4. Incoming data is parsed into structured format automatically
5. PHP requests are correlated with database activity via correlation ID
6. All data is stored in SQLite database with WAL mode enabled
7. Data older than 7 days is automatically deleted
8. Data is indexed by correlation ID, project, timestamp, and duration
9. Multi-project data is separated and filterable

**Deliverables:**
- HTTP/UDP receiver service
- Firewall configuration documentation
- Data parser for profiling payloads
- Correlation engine (matches PHP requests to DB activity)
- SQLite database schema with WAL mode
- 7-day retention policy implementation (automated cleanup)
- Indexes on correlation_id, project, timestamp, duration
- Multi-project data model
- Daemon startup scripts

**Dependencies:** Phase 1 (requires data format specification)

---

## Phase 4: Graylog Integration & Forwarding

**Goal:** All collected data flows to Graylog for long-term storage and analysis

**Requirements:** GELF-01, GELF-02, GELF-03, GELF-04, GELF-05

**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md - Database migration and GELF client setup
- [x] 04-02-PLAN.md - Circuit breaker and forwarder module
- [x] 04-03-PLAN.md - Handler integration and replay mechanism

**Success Criteria:**
1. All received data is forwarded to Graylog in GELF format over TCP
2. gelf-pro library used for Node.js/Bun compatibility (equivalent to PHP 7.4 GELF support)
3. Circuit breaker detects Graylog unavailability and fails fast
4. Data is buffered in SQLite during Graylog outages
5. Buffered data is replayed to Graylog when connection recovers
6. Project identifier is included in all GELF messages for filtering

**Deliverables:**
- GELF exporter using gelf-pro library
- Circuit breaker for Graylog connection (opossum)
- Retry queue in SQLite (forwarded_to_graylog column)
- Replay mechanism for buffered data
- GELF field mapping (correlation_id, project, custom fields)
- Connection health monitoring

**Dependencies:** Phase 3 (requires listener storage)

---

## Phase 5: Postgres Agent Database Monitoring

**Goal:** Database activity is monitored and correlated with PHP requests

**Requirements:** PG-01, PG-02, PG-03, PG-04, PG-05, PG-06, PG-07, PG-COMM-01, PG-COMM-02, PG-COMM-03, PG-COMM-04

**Plans:** 4 plans

Plans:
- [ ] 05-01-PLAN.md - Python project foundation with configuration and connection pool
- [ ] 05-02-PLAN.md - Data collectors (pg_stat_activity, pg_stat_statements, locks, system metrics)
- [ ] 05-03-PLAN.md - Log parser and transmission layer (circuit breaker, buffering)
- [ ] 05-04-PLAN.md - Daemon integration and systemd service

**Success Criteria:**
1. Agent queries pg_stat_activity every minute for active queries and locks
2. Agent queries pg_stat_statements for query performance statistics
3. Agent parses Postgres log files continuously
4. Agent collects system metrics (CPU, RAM, disk I/O) on DB server
5. Agent matches correlation IDs from PHP via application_name parameter
6. Agent detects and reports database locks and blocking queries
7. Agent never causes database failures or performance degradation
8. Agent sends data to listener via HTTP POST
9. Agent buffers locally when listener is unavailable
10. Agent includes project identifier with all sent data
11. Agent runs as daemon service on DB server (5.9.121.222)

**Deliverables:**
- pg_stat_activity poller (1-minute interval)
- pg_stat_statements query analyzer
- Postgres log parser (tail -f with parsing)
- System metrics collector (psutil or similar)
- Correlation ID matcher (application_name extraction)
- Lock detection module
- HTTP client for sending to listener
- Local buffering (SQLite or file-based)
- Daemon startup scripts for DB server
- Safety checks (query timeouts, connection pooling)

**Dependencies:** Phase 3 (requires listener to receive data)

---

## Phase 6: Query Interface & Visualization

**Goal:** Users can search, filter, and visualize collected profiling data

**Requirements:** QUERY-01, QUERY-02, QUERY-03, QUERY-04, QUERY-05, QUERY-06

**Success Criteria:**
1. Basic web UI displays logs directly on listener server
2. Search/filter API supports queries by project, URL, duration, timestamp
3. Timeline visualization shows request flow (PHP -> DB)
4. PHP request traces are linked to their SQL queries via correlation ID
5. Comparative analysis shows how a request compares to averages
6. Multi-project filtering works correctly

**Deliverables:**
- Web UI (simple HTML/CSS/JS interface)
- REST API for search/filter operations
- Timeline visualization component
- Correlation view (PHP request -> SQL queries)
- Statistical comparison module (request vs average)
- Project selector/filter
- Query builder interface

**Dependencies:** Phases 3, 4, 5 (requires data from all agents)

---

## Phase 7: Configuration & Deployment

**Goal:** System is deployable and configurable for production use

**Requirements:** CFG-01, CFG-02, CFG-03, CFG-04, CFG-05, CFG-06, CFG-07

**Success Criteria:**
1. Firewall rules are documented for PHP/DB servers -> listener communication
2. Installation script automates PHP agent daemon setup
3. Installation script automates Postgres agent daemon setup
4. Installation script automates listener server setup
5. listener.php integration is documented with examples
6. Settings file template is provided for profiling feature toggles
7. Multi-project configuration is documented (project name setup)

**Deliverables:**
- Firewall configuration guide (iptables/ufw rules)
- PHP agent installation script (systemd service, dependencies)
- Postgres agent installation script (systemd service, dependencies)
- Listener installation script (systemd service, SQLite setup)
- listener.php integration documentation with code examples
- settings.ini template with all toggleable features
- Multi-project configuration guide
- Troubleshooting documentation
- Architecture diagram

**Dependencies:** All previous phases (requires complete system)

---

## Milestone Success Criteria

**v1.0 is complete when:**

1. PHP agents are deployed on all web servers and capturing slow requests (>500ms)
2. Postgres agent is deployed on DB server (5.9.121.222) and monitoring activity
3. Central listener (88.198.22.206) is receiving data from all agents
4. All data is forwarded to Graylog successfully
5. Web UI allows searching and viewing profiling data
6. Correlation between PHP requests and SQL queries is working
7. Multi-project tracking is functional
8. System has been tested under load (simulated slow requests)
9. Documentation is complete for installation and operation
10. First load spike investigation has been successfully completed using the system

---

## Risk Mitigation

| Risk | Mitigation Strategy | Phase |
|------|-------------------|-------|
| Profiling overhead impacts production | Non-blocking I/O with strict 50ms timeout, circuit breaker | Phase 1, 2 |
| Memory leaks in long-running daemons | Worker restart policies, garbage collection | Phase 2 |
| Data volume overwhelming listener | 7-day retention, adaptive sampling in future | Phase 3 |
| Graylog downtime causes data loss | SQLite buffering with replay mechanism | Phase 4 |
| Observer effect (profiling causes load) | 500ms threshold, sampling strategy | Phase 1 |
| Correlation failures | UUID v4 + application_name propagation | Phases 1, 5 |

---

*Last updated: 2026-01-28 after Phase 5 planning*
