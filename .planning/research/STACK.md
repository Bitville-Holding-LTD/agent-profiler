# Stack Research: APM & Centralized Logging

**Domain:** Application Performance Monitoring (APM) and Centralized Logging Infrastructure
**Researched:** 2026-01-27
**Confidence:** MEDIUM-HIGH

## Recommended Stack

### PHP Profiling Extensions

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|-----------|
| XHProf (longxinH fork) | 2.3.10+ | Function-level profiling | Revitalized PECL extension with modern timer APIs, supports PHP 7.2-8.2, optimized for production with low overhead. Officially maintained again as of 2024. | HIGH |
| SPX (NoiseByNorthwest) | Latest | Detailed profiling with web UI | Full call stack preservation (unlike XHProf's aggregation), 22 metrics including I/O and GC, built-in web UI. Best for development/staging deep-dive analysis. | HIGH |

**Key Decision:**
- **XHProf** for production agents (lower overhead, proven at scale)
- **SPX** for development/staging (richer data, easier visualization)

### PostgreSQL Monitoring Tools

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|-----------|
| pg_stat_statements | Built-in | Query performance tracking | Native PostgreSQL extension, aggregates historical query stats, essential for identifying slow queries over time. Requires shared memory, loaded via shared_preload_libraries. | HIGH |
| pg_stat_activity | Built-in | Real-time connection monitoring | System view providing live snapshot of active backends, connections, and current queries. No installation needed. | HIGH |
| pgBadger | Latest (12.x+) | Log analysis & reporting | Fast Perl-based log analyzer, generates HTML reports with query performance metrics, checkpoint/autovacuum stats. Outperforms alternatives, handles huge/compressed logs. | HIGH |

**Key Decision:**
- **pg_stat_statements** + **pg_stat_activity** for real-time monitoring
- **pgBadger** for historical analysis and troubleshooting
- Agent queries these sources, doesn't reinvent the wheel

### Communication & Data Transport

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|-----------|
| UDP Sockets (native PHP) | PHP 7.4 built-in | Agent → Listener communication | Non-blocking by nature, fire-and-forget semantics prevent blocking requests. Use `socket_sendto()` with 50ms timeout. No external dependencies. | HIGH |
| graylog2/gelf-php | 1.7.1 | GELF message formatting | Official GELF library (v1.x supports PHP 7.4). Well-maintained, conforms to PSR standards, supports UDP/TCP/HTTP transports. | MEDIUM |

**Key Decision:**
- **Native UDP sockets** for agent → listener (simplest, fastest)
- **graylog2/gelf-php 1.x** for listener → Graylog (proven GELF implementation)
- Avoid heavyweight async frameworks (ReactPHP, AMPHP) for simple fire-and-forget UDP

### Central Listener Storage

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|-----------|
| SQLite | 3.40+ | Short-term metric storage | Zero admin, embedded, sufficient for buffer/query before Graylog forward. Good for write-heavy workloads at moderate scale. | MEDIUM |
| VictoriaMetrics | 1.95+ (if scaling needed) | Time-series metric storage | 20x better performance than InfluxDB, 10x less RAM. PromQL-compatible, excellent compression. Ideal if SQLite becomes bottleneck. | MEDIUM |

**Key Decision:**
- **Start with SQLite** (simpler, meets 3-server requirement)
- **Migrate to VictoriaMetrics** if/when storing 100K+ datapoints/minute or needing advanced querying
- Avoid InfluxDB (resource-heavy) and full Prometheus (overkill for single-server listener)

### System Metrics Collection

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|-----------|
| /proc filesystem | Native Linux | CPU, memory, load | Direct reads from /proc/stat, /proc/meminfo, /proc/loadavg. Zero overhead, no dependencies. | HIGH |
| ps command | Native Linux | Process metrics | Lightweight process sampling for CPU/memory per process. Use `ps -p <pid> -o %cpu,%mem,rss` | HIGH |
| netstat/ss | Native Linux | Network connection stats | Track active connections, socket states. Use for context around load spikes. | HIGH |

**Key Decision:**
- **Use native Linux /proc** and standard utilities
- Avoid heavyweight agents (Datadog, New Relic) - you're building the agent
- Avoid node_exporter/Telegraf - unnecessary for 3 servers

### Supporting Libraries (PHP)

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|-----------|
| perftools/php-profiler | Latest | XHProf data collection | High-level wrapper for XHProf, handles profiling lifecycle, data persistence. Use if building UI for trace analysis. | MEDIUM |
| psr/log | Latest | Logging interface | PSR-3 logging abstraction. Use for agent logging to avoid tight coupling. | HIGH |
| ext-sockets | PHP 7.4 built-in | UDP socket operations | Required for UDP communication. Verify enabled: `php -m \| grep sockets` | HIGH |
| ext-pdo_sqlite | PHP 7.4 built-in | SQLite database access | Required for listener storage. Verify enabled: `php -m \| grep pdo_sqlite` | HIGH |

### Supporting Libraries (PostgreSQL Agent)

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|-----------|
| ext-pgsql | PHP 7.4 built-in | PostgreSQL connectivity | Native PHP extension for querying pg_stat_* views. Simpler than PDO for this use case. | HIGH |

## Installation

### PHP Agent (Web Servers)

```bash
# Install XHProf PECL extension
cd /tmp
git clone https://github.com/longxinH/xhprof.git
cd xhprof/extension
phpize
./configure --with-php-config=/usr/bin/php-config
make
sudo make install

# Enable in php.ini
echo "extension=xhprof.so" | sudo tee -a /etc/php/7.4/mods-available/xhprof.ini
echo "xhprof.output_dir=/tmp/xhprof" | sudo tee -a /etc/php/7.4/mods-available/xhprof.ini
sudo mkdir -p /tmp/xhprof
sudo chmod 777 /tmp/xhprof
sudo phpenmod xhprof

# Install GELF library (for agent communication)
composer require graylog2/gelf-php:^1.7
composer require psr/log

# Verify extensions
php -m | grep -E 'xhprof|sockets|pdo_sqlite'
```

### PostgreSQL Agent

```bash
# Install pgBadger on DB server
sudo apt-get install -y pgbadger  # Debian/Ubuntu
# or
sudo yum install -y pgbadger       # RHEL/CentOS

# Enable pg_stat_statements in postgresql.conf
# Add to shared_preload_libraries:
shared_preload_libraries = 'pg_stat_statements'

# Restart PostgreSQL
sudo systemctl restart postgresql

# Create extension in database
psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

# Configure logging for pgBadger
# In postgresql.conf:
log_destination = 'stderr'
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_duration = off
log_lock_waits = on
log_statement = 'none'
log_temp_files = 0
log_autovacuum_min_duration = 0
log_error_verbosity = default

# Verify pg_stat_statements
psql -U postgres -c "SELECT * FROM pg_stat_statements LIMIT 1;"
```

### Central Listener

```bash
# Install GELF library for Graylog forwarding
composer require graylog2/gelf-php:^1.7
composer require psr/log

# Verify SQLite support
php -m | grep pdo_sqlite

# Create SQLite database
mkdir -p /var/lib/apm-listener
sqlite3 /var/lib/apm-listener/metrics.db < schema.sql
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative | Why Not Default |
|-------------|-------------|-------------------------|-----------------|
| XHProf (longxinH fork) | Tideways XHProf fork | Never - project archived | Tideways fork archived in favor of revitalized PECL XHProf |
| XHProf | Blackfire.io | SaaS APM with managed infrastructure | Commercial SaaS, external dependency, not self-hosted |
| XHProf | Xdebug profiler | Local development only | 10-50x higher overhead, not safe for production |
| Native UDP sockets | ReactPHP/AMPHP | Complex async workflows, WebSockets, streaming | Adds event loop complexity for simple fire-and-forget UDP |
| graylog2/gelf-php | Roll your own GELF | Never | GELF spec is complex (chunking, compression), official library is maintained |
| SQLite | PostgreSQL | Listener becomes multi-server or needs complex queries | Overhead of managing another Postgres instance |
| SQLite | VictoriaMetrics | Storing >100K datapoints/minute, need PromQL queries | More complex setup, overkill for 3 web servers |
| /proc filesystem | Collectd/Telegraf | Monitoring 50+ servers | Unnecessary agent for 3-4 servers |
| pg_stat_statements | pganalyze | Need commercial support, hosted UI | $399/month, hosted SaaS |

## What NOT to Use

| Avoid | Why | Use Instead | Confidence |
|-------|-----|-------------|-----------|
| Tideways XHProf extension | Project archived as of 2024 | longxinH/xhprof (revitalized PECL) | HIGH |
| graylog2/gelf-php 2.x | Requires PHP >=8.0 | graylog2/gelf-php 1.7.x | HIGH |
| Xdebug for profiling | 10-50x overhead, blocks requests | XHProf for production profiling | HIGH |
| InfluxDB | 10x more RAM than VictoriaMetrics, slower writes | VictoriaMetrics (if scaling beyond SQLite) | MEDIUM |
| Full Prometheus | Designed for pull-based, multi-server scraping | VictoriaMetrics or SQLite | MEDIUM |
| node_exporter | Designed for Prometheus ecosystem | Native /proc reads | MEDIUM |
| mlehner/gelf-php fork | Outdated, unmaintained | Official graylog2/gelf-php | HIGH |
| Async frameworks for UDP | ReactPHP, AMPHP add event loop complexity | Native socket_sendto() | MEDIUM |

## Stack Patterns by Constraint

### If Request Timeout is Critical (<50ms profiling overhead):
- Use XHProf with conditional sampling (only profile requests >500ms)
- Implement timeout wrapper: `socket_sendto()` with `SO_SNDTIMEO` = 50ms
- Skip silently on timeout (fire-and-forget semantics)
- Log dropped payloads to error log for monitoring

### If Storage Scales Beyond SQLite (>100K datapoints/minute):
- Migrate to VictoriaMetrics single-node
- Keep SQLite schema for compatibility
- Use VictoriaMetrics' InfluxDB line protocol for inserts
- Benefit: 20x performance improvement, 10x less RAM

### If Profiling Data Volume is High:
- Sample: profile 1% of requests randomly (using `mt_rand(1, 100) === 1`)
- Always profile: requests >500ms (as specified)
- Always profile: requests with error status codes
- Store aggregated data, not every trace

### If Network is Unreliable:
- Add retry logic to listener → Graylog forwarding (not agent → listener)
- Buffer failed GELF sends in SQLite for retry
- Agents never retry (fire-and-forget)

## Version Compatibility Matrix

| Package/Extension | PHP 7.4.33 | PHP 8.0+ | Notes |
|-------------------|------------|----------|-------|
| XHProf (longxinH) | ✓ | ✓ | Supports PHP 7.2-8.2 |
| SPX | ✓ | ✓ | Supports PHP 5.4-8.5 (experimental on 8.5) |
| graylog2/gelf-php 1.7.x | ✓ | ✓ | v1.x supports PHP 5.6-7.4 |
| graylog2/gelf-php 2.x | ✗ | ✓ | v2.x requires PHP >=8.0 |
| ext-sockets | ✓ | ✓ | Core extension |
| ext-pdo_sqlite | ✓ | ✓ | Core extension |
| perftools/php-profiler | ✓ | ✓ | Requires PHP >=7.1 |

## Architecture Decisions

### Agent Communication Pattern
```
[PHP Agent] --UDP (fire-and-forget)--> [Central Listener] --GELF/UDP--> [Graylog]
    │                                           │
    └─ 50ms timeout, skip on failure           └─ Retry logic, buffer in SQLite
```

**Rationale:**
- Agents never block requests (UDP is non-blocking)
- Listener handles retries/buffering (decouples agent from Graylog availability)
- UDP naturally load-balances if listener becomes multi-server later

### Profiling Trigger Logic
```php
// In PHP agent bootstrap
$should_profile = (
    ($_SERVER['REQUEST_TIME_FLOAT'] ?? 0) > 0.5  // >500ms (check at shutdown)
    || mt_rand(1, 100) === 1                       // 1% random sample
    || http_response_code() >= 500                 // Server errors
);

if ($should_profile) {
    xhprof_enable(XHPROF_FLAGS_CPU | XHPROF_FLAGS_MEMORY);
}
```

**Rationale:**
- Minimize overhead by profiling selectively
- Capture all slow requests (root cause of load spikes)
- Random sampling provides baseline performance data
- Error profiling identifies exception-related slowdowns

### PostgreSQL Monitoring Queries
```sql
-- Real-time active queries
SELECT pid, usename, application_name, client_addr, state, query,
       now() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle' AND query NOT ILIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- Top slow queries (historical)
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Database load metrics
SELECT sum(numbackends) AS connections,
       sum(xact_commit) AS commits,
       sum(xact_rollback) AS rollbacks,
       sum(blks_read) AS disk_reads,
       sum(blks_hit) AS cache_hits
FROM pg_stat_database
WHERE datname NOT IN ('template0', 'template1');
```

**Rationale:**
- pg_stat_activity for "what's happening now" during load spikes
- pg_stat_statements for "what's been slow historically"
- Combined view identifies correlations between queries and load

## Critical Configuration Notes

### XHProf Output Directory
**IMPORTANT:** XHProf writes trace files to `xhprof.output_dir`. On production:
- Use tmpfs mount for performance: `mount -t tmpfs -o size=512M tmpfs /tmp/xhprof`
- Implement cleanup: `find /tmp/xhprof -mtime +1 -delete` (cron daily)
- Agent reads traces, sends to listener, then deletes

### UDP Packet Size Limits
**IMPORTANT:** UDP has MTU limits (typically 1500 bytes Ethernet):
- GELF supports chunking for >1420 bytes
- Keep profiling payloads small: send aggregated data, not full traces
- If payload >1KB, split into multiple UDP packets or use TCP fallback

### SQLite WAL Mode
**IMPORTANT:** Enable Write-Ahead Logging for concurrent reads:
```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```
- WAL allows readers while writer inserts
- NORMAL synchronous sufficient (we can lose recent data on crash)

### PostgreSQL pg_stat_statements Reset
**IMPORTANT:** Reset statistics periodically to avoid unbounded growth:
```sql
SELECT pg_stat_statements_reset();
```
- Run weekly or when rows > 10,000
- Schedule in cron: `psql -U postgres -c "SELECT pg_stat_statements_reset();"`

## Performance Expectations

### XHProf Overhead
- **CPU:** ~5-10% overhead per profiled request
- **Memory:** ~100KB per trace
- **I/O:** One file write per trace (mitigated by tmpfs)

### UDP Communication
- **Latency:** <1ms for local network (sub-millisecond to listener on same datacenter)
- **Packet loss:** ~0.1% typical (acceptable for APM metrics)
- **Bandwidth:** ~2KB per profiled request × profiling rate

### SQLite Throughput
- **Writes:** 10,000-50,000 inserts/second (SSD, WAL mode)
- **Reads:** Concurrent with writes (WAL mode)
- **Bottleneck:** Disk I/O becomes limiting factor at ~100K inserts/second

### Expected Load (3 Web Servers)
- Assume 100 req/sec per server = 300 req/sec total
- Profile 1% + slow requests (>500ms)
- Estimated profiling rate: 5-10 req/sec
- UDP bandwidth: ~10-20KB/sec
- SQLite writes: 5-10 inserts/sec (well below limits)

## Sources

**PHP Profiling:**
- [Tideways: The 6 Best PHP Profilers](https://tideways.com/the-6-best-php-profilers) - Comparison of XHProf, SPX, Blackfire, Xdebug
- [XHProf for PHP7 and PHP8](https://tideways.com/profiler/xhprof-for-php7) - Modern XHProf fork info
- [GitHub: longxinH/xhprof](https://github.com/longxinH/xhprof) - Official revitalized PECL XHProf (verified 2024-07-09 release)
- [GitHub: NoiseByNorthwest/php-spx](https://github.com/NoiseByNorthwest/php-spx) - SPX profiler documentation (verified PHP 5.4-8.5 support)
- [Tideways: Profiling Overhead and PHP 7](https://tideways.com/profiler/blog/profiling-overhead-and-php-7) - Performance comparison

**PostgreSQL Monitoring:**
- [PostgreSQL Documentation: pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) - Official docs
- [PostgreSQL Documentation: The Cumulative Statistics System](https://www.postgresql.org/docs/current/monitoring-stats.html) - pg_stat_activity official docs
- [GitHub: darold/pgbadger](https://github.com/darold/pgbadger) - pgBadger repository (verified 1,512 commits, active)
- [MSSQLTips: PostgreSQL Monitoring with pg_stat_statements](https://www.mssqltips.com/sqlservertip/8295/postgresql-monitoring-with-pg-stat-statements/)
- [Medium: Monitoring Active Queries in PostgreSQL](https://medium.com/@jramcloud1/monitoring-active-queries-in-postgresql-real-time-performance-diagnostics-using-pg-stat-activity-cd707a42aee7)

**GELF & Graylog:**
- [Packagist: graylog2/gelf-php](https://packagist.org/packages/graylog2/gelf-php) - Official library (verified 2025-01-20 v2.0.2 release, PHP 8.0+ requirement)
- [GitHub: bzikarsky/gelf-php](https://github.com/bzikarsky/gelf-php) - Official implementation
- [Graylog Community: PHP GELF Library](https://community.graylog.org/t/php-gelf-library/23227) - Community support

**Time-Series Databases:**
- [RisingWave: Comparing Time Series Databases](https://risingwave.com/blog/comparing-monitoring-and-alerting-features-of-open-source-time-series-databases-prometheus-vs-influxdb-vs-victoriametrics/)
- [VictoriaMetrics Documentation](https://docs.victoriametrics.com/)
- [Benchmarking InfluxDB vs VictoriaMetrics](https://soufianebouchaara.com/benchmarking-influxdb-vs-victoriametrics-choosing-the-right-time-series-database/)

**Async PHP & Communication:**
- [Medium: Async PHP in 2025](https://medium.com/@mohamadshahkhajeh/async-php-in-2025-beyond-workers-with-fibers-reactphp-and-amp-e7de384c3ea6)
- [AMPHP Socket Documentation](https://amphp.org/socket) - Non-blocking TCP/UDP sockets
- [PHP Manual: socket_set_nonblock](https://www.php.net/manual/en/function.socket-set-nonblock.php)

**System Monitoring:**
- [Better Stack: 10 Best Linux Monitoring Tools in 2026](https://betterstack.com/community/comparisons/linux-monitoring-tools/)
- [Jeff Geerling: Top 10 Ways to Monitor Linux in the Console](https://www.jeffgeerling.com/blog/2025/top-10-ways-monitor-linux-console) - 2025 tools review
- [TuxCare: 2025 Linux Monitoring Guide](https://tuxcare.com/blog/linux-monitoring/)

---

*Stack research for: Bitville APM & Centralized Logging*
*Researched: 2026-01-27*
*PHP Version Constraint: 7.4.33*
*Infrastructure: 3 web servers + 1 DB server + 1 listener server*
