# Bitville APM & Centralized Logging System

An Application Performance Monitoring (APM) system designed to identify and diagnose random load spikes in PHP/Phalcon applications by capturing detailed profiling data and correlating it with database activity.

## Overview

Bitville APM is a lightweight, production-safe monitoring solution that captures performance data from PHP applications and PostgreSQL databases to help identify the root cause of performance issues. The system consists of three main components working together to collect, store, and analyze profiling data.

### Core Value

**Identify which PHP functions, SQL queries, or specific requests are causing random load spikes** (up to 200 load average) so they can be analyzed and fixed.

## Architecture

The system is composed of three interconnected components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PHP Servers   │────▶│  Listener       │────▶│    Graylog      │
│   (Agent)       │     │  (88.198.22.206)│     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       ▲
        │                       │
        ▼                       │
┌─────────────────┐             │
│   PostgreSQL    │─────────────┘
│   (Agent)       │
│ (5.9.121.222)   │
└─────────────────┘
```

### 1. PHP Agent (Web Servers)
- **Purpose**: Captures detailed profiling data for slow PHP requests (>500ms)
- **Features**:
  - Function-level timing breakdown using XHProf
  - SQL query capture with timing and stack traces
  - Request metadata collection (URL, method, headers, variables)
  - Memory usage tracking
  - Non-blocking transmission with 50ms timeout
  - Configurable feature toggles
- **Safety**: Fails silently if listener is unreachable - never impacts application performance

### 2. PostgreSQL Agent (Database Server)
- **Purpose**: Monitors database activity and correlates with PHP requests
- **Features**:
  - pg_stat_activity polling for active queries and locks
  - pg_stat_statements analysis for query performance
  - Postgres log parsing
  - System metrics collection (CPU, RAM, disk I/O)
  - Correlation ID matching via application_name

### 3. Central Listener (88.198.22.206)
- **Purpose**: Receives, stores, and forwards monitoring data
- **Features**:
  - Accepts data from multiple PHP and PostgreSQL agents
  - SQLite storage with 7-day retention
  - GELF forwarding to Graylog for long-term analysis
  - Request/query correlation by unique correlation ID
  - Multi-project support

## Current Status

🚧 **In Active Development** - **38% Complete** (18/48 requirements delivered)

| Phase | Status | Progress |
|-------|--------|----------|
| **Phase 1**: PHP Agent Core Instrumentation & Safety | ✅ Complete | 100% |
| **Phase 2**: PHP Agent Daemon Architecture & Lifecycle | ✅ Complete | 100% |
| **Phase 3**: Central Listener Data Reception & Storage | 🔄 In Progress | ~75% |
| **Phase 4**: Graylog Integration & Forwarding | ⏳ Pending | 0% |
| **Phase 5**: Postgres Agent Database Monitoring | ⏳ Pending | 0% |
| **Phase 6**: Query Interface & Visualization | ⏳ Pending | 0% |
| **Phase 7**: Configuration & Deployment | ⏳ Pending | 0% |

**Completed Features (Phases 1-2):**
- ✅ Configuration system with feature toggles
- ✅ UUID v4 correlation ID generation
- ✅ XHProf integration for function profiling
- ✅ SQL query capture via Phalcon events
- ✅ Request metadata collection with sensitive data filtering
- ✅ Memory usage tracking
- ✅ Non-blocking socket transmission with disk buffer fallback
- ✅ listener.php integration file for PHP applications
- ✅ ReactPHP-based daemon with event loop
- ✅ Worker lifecycle management (memory/request limits, garbage collection)
- ✅ Circuit breaker pattern for failure handling
- ✅ Buffer management (memory + disk overflow with FIFO replay)
- ✅ HTTP transmitter to central listener
- ✅ Health check endpoint for monitoring
- ✅ Graceful shutdown handling (SIGTERM/SIGHUP)

**In Progress (Phase 3):**
- ✅ SQLite database with WAL mode for concurrent access
- ✅ HTTP/HTTPS server with Bearer token authentication
- ✅ UDP receiver for fire-and-forget ingestion
- ✅ Rate limiting (100 requests/minute per IP)
- ✅ 7-day automatic retention with hourly cleanup
- ✅ Health/readiness endpoints with diagnostics
- ✅ Systemd service with security hardening
- 🔄 Data correlation by correlation ID
- 🔄 Multi-project data separation

## Key Features

### Production-Safe Design
- **Non-blocking I/O**: 50ms timeout enforced at kernel level
- **Circuit breaker**: Auto-disables after consecutive failures
- **Silent failures**: Never causes PHP application errors
- **Minimal overhead**: Only profiles requests >500ms
- **Memory management**: Worker restart policies prevent leaks

### Comprehensive Data Collection
- **Function-level profiling**: XHProf integration with noise filtering
- **SQL query tracking**: Full queries with timing and stack traces
- **Request correlation**: UUID v4 linking PHP requests to DB queries
- **Metadata capture**: URL, method, headers, GET/POST variables
- **Memory tracking**: Peak memory and allocation patterns

### Security & Privacy
- **Sensitive data filtering**: Automatic redaction of passwords, tokens, API keys
- **String truncation**: Prevents memory exhaustion from large values
- **Configurable toggles**: Enable/disable features per environment
- **Firewall-protected**: Listener accepts only authorized servers

## Requirements

### PHP Agent Requirements
- **PHP**: 7.4.33+ (tested on PHP 7.4.33)
- **Extensions**: 
  - xhprof (for function profiling)
  - sockets (for network communication)
  - json (typically built-in)
- **Framework**: Phalcon (for SQL capture integration)
- **Permissions**: Write access to `/var/lib/bitville-apm/` for buffering

### PostgreSQL Agent Requirements
- **PostgreSQL**: 9.6+ (any version with pg_stat_statements support)
- **Extensions**: pg_stat_statements enabled
- **Permissions**: Read access to Postgres logs and pg_stat_* views

### Central Listener Requirements
- **Bun**: 1.0+ (JavaScript/TypeScript runtime)
- **SQLite**: 3.x
- **Network**: Accessible from PHP and DB servers (ports 8443 HTTPS, 8444 UDP)
- **Storage**: ~1GB for 7-day retention (varies by traffic)
- **Optional**: TLS certificates for HTTPS (falls back to HTTP if not provided)

## Installation

> ⚠️ **Note**: Installation scripts are planned for Phase 7. Current installation requires manual setup.

### Quick Start (PHP Agent)

1. **Install XHProf extension**:
   ```bash
   pecl install xhprof
   ```

2. **Configure php.ini**:
   ```ini
   extension=xhprof.so
   ```

3. **Copy profiling configuration**:
   ```bash
   cp config/profiling.ini /etc/bitville-apm/profiling.ini
   ```

4. **Integrate into your PHP application**:
   ```php
   <?php
   // At the top of your index.php or bootstrap file
   define('BITVILLE_APM_PROJECT', 'your-project-name');
   require_once '/path/to/php-agent/profiling/listener.php';
   
   // Your application code continues normally
   ```

5. **Verify integration**:
   - Make a request that takes >500ms
   - Check `/var/lib/bitville-apm/buffer/` for buffered data
   - Check logs for any errors

### Configuration

Configuration is managed via INI files with safe defaults (profiling disabled):

```ini
; /etc/bitville-apm/profiling.ini

[general]
enabled = false                  ; Master on/off switch
threshold_ms = 500               ; Only profile requests >500ms
project_name = "bitville"        ; Project identifier

[profiling]
xhprof_enabled = true           ; Function-level profiling
sql_capture_enabled = true      ; SQL query tracking
memory_tracking_enabled = true  ; Memory usage stats
metadata_collection_enabled = true  ; Request metadata

[transmission]
socket_path = "/var/run/bitville-apm.sock"
timeout_ms = 50                 ; Hard timeout for transmission
disk_buffer_path = "/var/lib/bitville-apm/buffer"
```

See `config/README.md` for detailed configuration options.

## Project Structure

```
bitville-monitoring/
├── .planning/              # Project planning and documentation
│   ├── PROJECT.md          # Project overview and requirements
│   ├── ROADMAP.md          # Phase breakdown and milestones
│   ├── REQUIREMENTS.md     # Detailed requirements tracking
│   ├── STATE.md            # Current implementation status
│   └── phases/             # Phase-specific plans and summaries
├── config/                 # Configuration files and examples
│   ├── profiling.ini       # PHP agent configuration
│   ├── supervisord.conf    # Daemon process management
│   └── bitville-apm-daemon.service  # systemd service file
├── php-agent/              # PHP agent implementation
│   ├── daemon/             # Daemon process components
│   │   ├── daemon.php      # Main daemon entry point
│   │   ├── daemon_manager.php  # Process lifecycle management
│   │   ├── buffer_manager.php  # Memory + disk buffering
│   │   ├── circuit_breaker.php # Failure tracking
│   │   └── transmitter.php     # HTTP forwarding to listener
│   └── profiling/          # Profiling components
│       ├── listener.php    # PHP application integration
│       ├── config_loader.php       # Configuration management
│       ├── correlation_id.php      # UUID v4 generation
│       ├── xhprof_profiler.php     # XHProf integration
│       ├── sql_capture.php         # SQL query capture
│       ├── metadata_collector.php  # Request metadata
│       └── socket_transmitter.php  # Socket communication
├── listener/               # Central listener server (TypeScript/Bun)
│   ├── index.ts            # Main server entry point
│   ├── src/
│   │   ├── server.ts       # HTTP/UDP server setup
│   │   ├── database/       # SQLite database layer
│   │   │   ├── connection.ts   # DB initialization
│   │   │   ├── queries.ts      # Prepared statements
│   │   │   └── cleanup.ts      # Retention policy
│   │   ├── handlers/       # Request handlers
│   │   │   ├── php-agent.ts    # PHP agent ingestion
│   │   │   ├── postgres-agent.ts  # Postgres agent ingestion
│   │   │   └── udp-receiver.ts    # UDP ingestion
│   │   ├── middleware/     # Server middleware
│   │   │   ├── auth.ts         # Bearer token authentication
│   │   │   ├── rate-limit.ts   # Rate limiting
│   │   │   └── validation.ts   # Payload validation
│   │   └── types/          # TypeScript type definitions
│   ├── bitville-listener.service  # systemd service file
│   └── package.json        # Dependencies (Bun)
└── README.md               # This file
```

## Documentation

Detailed documentation is available in the `.planning/` directory:

- **[PROJECT.md](.planning/PROJECT.md)**: Core value proposition, requirements, and constraints
- **[ROADMAP.md](.planning/ROADMAP.md)**: Complete phase breakdown with success criteria
- **[REQUIREMENTS.md](.planning/REQUIREMENTS.md)**: Detailed requirement tracking (48 requirements)
- **[STATE.md](.planning/STATE.md)**: Current implementation status and progress
- **[config/README.md](config/README.md)**: Configuration guide and examples

### Research Documentation
- **[ARCHITECTURE.md](.planning/research/ARCHITECTURE.md)**: System design and architectural decisions
- **[FEATURES.md](.planning/research/FEATURES.md)**: Feature analysis and trade-offs
- **[STACK.md](.planning/research/STACK.md)**: Technology stack evaluation
- **[PITFALLS.md](.planning/research/PITFALLS.md)**: Common mistakes and how to avoid them

## Usage

### Basic Integration

```php
<?php
// Define your project name
define('BITVILLE_APM_PROJECT', 'my-app');

// Include the listener (should be done early in bootstrap)
require_once '/path/to/php-agent/profiling/listener.php';

// Your application continues normally
// Profiling happens automatically for requests >500ms

// Optional: Get the current correlation ID
$correlationId = bitville_apm_get_correlation_id();

// Optional: Add custom context
bitville_apm_add_context('user_id', $userId);
bitville_apm_add_context('feature_flag', 'new-checkout');
```

### Checking Agent Status

```bash
# Check daemon status
supervisorctl status bitville-apm-daemon

# View recent profiling data (buffered)
ls -lh /var/lib/bitville-apm/buffer/

# Check circuit breaker state
cat /var/lib/bitville-apm/circuit_breaker_state.json

# View daemon logs
tail -f /var/log/bitville-apm/daemon.log
```

## Why This Exists

We needed to solve performance issues in our PHP applications and weren't satisfied with expensive commercial APM solutions. This is our attempt at solving simple problems that have large effects - capturing the right data at the right time without breaking the bank or adding complexity.

If you find this helpful for your own performance debugging, feel free to use it. We're sharing it publicly in case others face similar challenges.

## Development

### Running Tests

Tests are planned for Phase 7. Current development focuses on core functionality.

### Contributing

This is an open-source project. If you find it useful and want to contribute improvements, bug fixes, or documentation, contributions are welcome. This project is actively being developed to solve real production performance issues.

### Development Roadmap

See [ROADMAP.md](.planning/ROADMAP.md) for the complete 7-phase development plan.

**Next Milestones:**
1. Complete Phase 3 (Central Listener) - ~75% done
2. Add Graylog Integration (Phase 4)
3. Deploy PostgreSQL Agent (Phase 5)
4. Build Query Interface & Visualization (Phase 6)

## Technical Environment

- **PHP Version**: 7.4.33 with Phalcon framework
- **Database**: PostgreSQL with pg_stat_statements extension
- **Web Servers**: Multiple PHP servers (load-balanced)
- **Database Server**: 5.9.121.222 (read replica)
- **Central Listener**: 88.198.22.206
- **Entry Point**: `/var/www/project/site/public/index.php`

## Known Limitations

- **500ms threshold**: Only requests exceeding 500ms are profiled (by design)
- **7-day retention**: Central listener stores data for 7 days only (Graylog handles long-term storage)
- **PHP-specific**: Designed for PHP 7.4.33 and Phalcon framework
- **Single database**: Currently supports one PostgreSQL instance

## Troubleshooting

### PHP Agent Not Capturing Data

1. Check if profiling is enabled in config: `enabled = true`
2. Verify XHProf extension is loaded: `php -m | grep xhprof`
3. Ensure request duration exceeds threshold (default 500ms)
4. Check buffer directory permissions: `/var/lib/bitville-apm/buffer/`

### Circuit Breaker Opened

If the circuit breaker is open (profiling disabled due to failures):

1. Check circuit breaker state: `cat /var/lib/bitville-apm/circuit_breaker_state.json`
2. Verify listener server is reachable
3. Wait for retry timeout (60 seconds default) or restart daemon
4. Check daemon logs for transmission errors

### High Memory Usage

1. Verify worker restart policy is active (256MB threshold)
2. Check request count limit (1000 requests default)
3. Review XHProf flags (should be `XHPROF_FLAGS_NO_BUILTINS` only)
4. Ensure garbage collection is enabled

## License

Open Source - Use freely if you find it helpful for your own performance debugging needs.

## Contact

For questions or support, contact the development team.

---

**Last Updated**: 2026-01-27  
**Version**: v1.0-dev (Phase 3 in progress - 38% complete)  
**Status**: 🚧 Active Development

## Recent Progress

**Phase 2 Complete (2026-01-27)** 🎉
- ReactPHP daemon with event loop and Unix socket server
- Worker lifecycle management with memory/request limits
- Circuit breaker pattern with persistent state
- Buffer management (memory + disk overflow)
- HTTP transmitter with health checks
- Graceful shutdown handling

**Phase 3 In Progress (~75%)**
- SQLite database with WAL mode and unified schema
- HTTP/HTTPS server with Bearer token authentication
- UDP receiver for high-throughput ingestion
- Rate limiting (100 req/min per IP)
- 7-day retention with automated cleanup
- Systemd service with security hardening
