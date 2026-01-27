# Phase 1: PHP Agent Core Instrumentation & Safety - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a PHP profiler that captures detailed performance data (function timing via XHProf, memory usage, SQL queries with correlation IDs, request metadata) for slow requests (>500ms threshold) without ever breaking the production PHP 7.4/Phalcon application. This is the data collection core that all downstream analysis depends on.

**Scope:** Data collection and safe transmission only. Daemon architecture, listener server, and database monitoring are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Integration Approach
- Include listener.php **before Application->run()** in index.php (after autoloader, before try/catch)
- Project identifier is **hard-coded in listener.php** for each deployment
- Use **register_shutdown_function** to capture request end timing and send data
- **Try-catch all profiler code**, log errors to error_log on failure (never break the app)
- Fail completely silently to the user - profiler errors only visible in error_log

### Profiling Triggers
- **Retroactive profiling**: Enable XHProf at request start (low overhead mode), only send data if ≥ threshold
- **XHProf always on** during request execution to capture full call graph
- **Configurable threshold** (default 500ms) in profiling.ini
- **Write to disk buffer** if request exceeds max_execution_time before data can be sent
- Threshold check happens at shutdown - we always profile, decision to send happens at end

### SQL Capture Strategy
- Support **both Phalcon Db\Profiler and PDO profiling** (toggleable in config)
- Capture: **Query text + timing, query parameters, PHP stack trace**
- Skip: Rows affected/returned (not needed for root cause analysis)
- Inject correlation ID using **both methods**: SET application_name + SQL comment prepending
- **Redact sensitive patterns**: Replace password/token/secret patterns with [REDACTED]
- Track **full connection info**: host, port, database name, user for each query
- If SQL capture fails: **Disable SQL capture only**, continue profiling other data
- Format: `/* correlation:<uuid> */ SELECT ...` prepended to every query

### Configuration Toggles
- Format: **INI file** (profiling.ini) - simple, human-readable
- Toggleable features:
  - `xhprof_enabled` - Enable/disable function-level timing
  - `memory_tracking` - Enable/disable memory usage capture
  - `sql_capture_method` - Values: phalcon, pdo, both, none
  - `request_metadata` - Enable/disable headers, GET/POST capture
  - `threshold_ms` - Profiling send threshold (default: 500)
  - `listener_host` - Listener server address
  - `project_name` - Override hard-coded project name
- **Requires PHP-FPM restart** to reload config (cache in opcache)
- **Use safe defaults** if config file missing/invalid (all features enabled, 500ms threshold)
- Location: `/etc/bitville-apm/profiling.ini` or configurable path

### Claude's Discretion
- Exact XHProf flags and configuration for optimal overhead
- Stack trace depth limit (how many frames to capture)
- Sensitive data pattern matching (regex for password/token detection)
- Disk buffer file naming and cleanup strategy
- Memory limits for profiling data before forcing disk write
- Query capture approach differentiation (when to use full vs minimal capture)

</decisions>

<specifics>
## Specific Ideas

- **Listener server must be written in Bun** (not PHP) for performance
- PHP 7.4.33 environment with Phalcon framework
- Entry point: `/var/www/project/site/public/index.php`
- Multiple PHP web servers (load-balanced) will all send to single listener
- 50ms timeout constraint for data transmission (skip silently if exceeded)
- Research needed: XHProf low-overhead mode configuration for always-on profiling

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 01-php-agent-core-instrumentation-safety*
*Context gathered: 2026-01-27*
