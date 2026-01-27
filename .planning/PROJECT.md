# Bitville APM & Centralized Logging System

## What This Is

An Application Performance Monitoring (APM) system for a PHP/Phalcon + Postgres stack that captures detailed profiling data to identify the root cause of random load spikes (up to 200 load average). The system consists of three components: PHP agent daemons running on each web server, a Postgres agent daemon on the database server, and a central listener server that receives, stores (7-day retention), and forwards logs to Graylog in GELF format.

## Core Value

Identify which PHP functions, SQL queries, or specific requests are causing random load spikes up to 200 load average so they can be analyzed and fixed.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**PHP Agent (runs on each PHP web server):**
- [ ] Capture profiling data only for requests exceeding 500ms
- [ ] Generate unique request ID for correlation with database queries
- [ ] Collect function timing breakdown (requires profiler integration)
- [ ] Collect request metadata (URL, method, headers, GET/POST variables, response time)
- [ ] Collect memory usage (peak memory, allocations)
- [ ] Collect all SQL queries executed during request with timing
- [ ] Support configurable on/off toggles for each profiling feature
- [ ] Send data to listener daemon within 50ms timeout
- [ ] Skip silently if listener unreachable (never cause request failure)
- [ ] Run as background daemon process on each PHP server
- [ ] Provide include file for PHP app integration (listener.php)

**Postgres Agent (runs on DB server 5.9.121.222):**
- [ ] Parse Postgres log files continuously for query logs
- [ ] Query pg_stat_activity every minute for active queries and locks
- [ ] Query pg_stat_statements for query performance statistics
- [ ] Collect system metrics (CPU, RAM, disk I/O)
- [ ] Accept request IDs from PHP via application_name or SQL comments
- [ ] Never cause database failures or performance degradation
- [ ] Send collected data to listener server

**Listener Server (88.198.22.206):**
- [ ] Receive profiling data from multiple PHP agents
- [ ] Receive monitoring data from Postgres agent
- [ ] Store all data in SQLite database
- [ ] Implement 7-day automatic retention (auto-delete old records)
- [ ] Forward all received data to Graylog in GELF format
- [ ] Accept connections only from authorized PHP and DB servers (firewall rules)
- [ ] Run as daemon service

### Out of Scope

- Real-time alerting system — will use Graylog's alerting features
- Custom analysis dashboard — will use Graylog UI + Claude/Cursor AI for analysis
- Historical data retention beyond 7 days — Graylog handles long-term storage
- Profiling requests under 500ms — only slow requests need investigation
- Application code changes beyond including listener.php — minimal invasiveness

## Context

**Technical Environment:**
- PHP 7.4.33 with Phalcon framework
- Entry point: `/var/www/project/site/public/index.php`
- Multiple PHP web servers (load-balanced)
- Postgres database with pg_stat_statements extension available
- DB server: 5.9.121.222 (read replica)
- Central listener: 88.198.22.206

**Problem Being Solved:**
- Experiencing random, unpredictable load spikes reaching 200 load average
- No visibility into which code paths or queries cause the spikes
- Need correlation between PHP request flow and database activity
- Current monitoring (New Relic attempted but not working) insufficient

**Integration Point:**
- PHP app will include a `listener.php` file that sends profiling data
- Include must be conditional (only for requests >500ms) and non-blocking

## Constraints

- **Reliability**: PHP and Postgres agents must NEVER cause application or database failures
- **Performance**: PHP agent must respond within 50ms or skip silently (no blocking)
- **Storage**: 7-day retention limit on listener server to prevent disk space issues
- **Network**: Firewall rules must be configured to allow PHP/DB servers → listener communication
- **Threshold**: Only profile PHP requests exceeding 500ms
- **PHP Version**: Must be compatible with PHP 7.4.33
- **Tech Stack**: Postgres agent must work with existing Postgres setup
- **Format**: Graylog integration must use GELF (Graylog Extended Log Format)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Daemon architecture for agents | Non-blocking, prevents request-level overhead | — Pending |
| 50ms timeout for PHP agent | Balance between capturing data and not slowing requests | — Pending |
| 500ms threshold for profiling | Focus on slow requests causing load issues | — Pending |
| SQLite for listener storage | Simple, embedded, sufficient for 7-day buffer | — Pending |
| GELF format for Graylog | Native Graylog format, best compatibility | — Pending |
| Request ID correlation | Links PHP requests to their database queries | — Pending |
| Skip silently on timeout | Prioritizes app reliability over monitoring completeness | — Pending |

---
*Last updated: 2026-01-27 after initialization*
