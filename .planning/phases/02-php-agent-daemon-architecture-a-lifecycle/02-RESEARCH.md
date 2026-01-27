# Phase 2: PHP Agent Daemon Architecture & Lifecycle - Research

**Researched:** 2026-01-27
**Domain:** PHP daemon architecture, process lifecycle management, APM agent patterns
**Confidence:** MEDIUM

## Summary

This research investigates whether Phase 2 needs a local daemon on each web server, and if so, how to build a production-ready PHP daemon with reliable lifecycle management. The core question is architectural: should listener.php (from Phase 1) send data directly to the central listener (Phase 3), or should a local daemon sit between them?

The industry standard for PHP APM agents is **daemon-based architecture**. New Relic, the dominant PHP APM provider, uses a local proxy daemon on each server that aggregates data from multiple PHP processes, reduces network traffic, handles buffering when the backend is unavailable, and improves application response time by offloading network I/O. Elastic APM agents use direct transmission, but they're library-based agents loaded into each PHP-FPM process, which doesn't match our request-scoped listener.php design.

For Phase 2, a **local daemon is recommended** because: (1) it provides buffering when the central listener is down, (2) it aggregates profiling data from multiple web requests before transmission, (3) it implements circuit breaker logic to disable profiling system-wide when failures occur, and (4) it handles worker lifecycle management (memory thresholds, request limits) without requiring PHP-FPM restarts. The daemon should use ReactPHP for the event loop, supervisord or systemd for process management, and Unix domain sockets for receiving data from listener.php.

**Primary recommendation:** Build a local daemon on each web server using ReactPHP EventLoop with Unix domain socket server, managed by supervisord, with worker process recycling after 256MB memory or 1000 requests, and circuit breaker pattern for automatic profiling disable.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ReactPHP | 1.x | Event loop for async socket server | Industry standard for PHP async I/O, mature ecosystem, low overhead |
| reactphp/socket | 1.x | Unix domain socket server | Official ReactPHP component for socket servers |
| supervisord | 4.x | Daemon process manager | UNIX-standard process supervisor, simpler than systemd for single services |
| eljam/circuit-breaker | Latest | Circuit breaker pattern | PHP implementation with multiprocess support via Doctrine cache |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| systemd | Native | Alternative process manager | When supervisord not available, for system-level integration |
| pcntl extension | PHP 7.4 | Signal handling (SIGTERM, SIGHUP) | For graceful shutdown and config reload |
| Doctrine Cache | Latest | Circuit breaker state storage | Shared state across multiple daemon workers |
| gc_collect_cycles() | Built-in | Manual garbage collection | Long-running process memory management |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ReactPHP | Swoole/OpenSwoole | Swoole has better performance but requires C extension, less portable, harder to debug |
| supervisord | systemd only | systemd more complex for single daemon, supervisord easier to configure |
| Unix domain socket | UDP on localhost | Unix domain 40% faster, no network stack overhead (from Phase 1 research) |
| eljam/circuit-breaker | Custom implementation | Circuit breaker pattern has subtle edge cases, mature library handles them |

**Installation:**
```bash
# ReactPHP socket server
composer require react/socket react/event-loop

# Circuit breaker
composer require eljam/circuit-breaker

# Supervisord (Ubuntu/Debian)
sudo apt-get install supervisor

# Or systemd (already installed on most Linux)
# No installation needed
```

## Architecture Patterns

### Recommended Project Structure
```
/var/www/project/profiling/
├── daemon/
│   ├── daemon.php              # Main daemon entry point
│   ├── socket_server.php       # Unix domain socket listener
│   ├── worker_manager.php      # Worker lifecycle management
│   ├── circuit_breaker.php     # Circuit breaker implementation
│   ├── buffer_manager.php      # Memory + disk buffer
│   └── transmitter.php         # Send to central listener (Phase 3)
├── config/
│   ├── supervisord.conf        # Supervisord configuration
│   └── daemon.service          # Systemd unit file (alternative)
└── listener.php                # Phase 1 include file (sends to daemon)

/var/run/bitville-apm/
└── listener.sock               # Unix domain socket for daemon

/var/lib/bitville-apm/
├── buffer/                     # Disk overflow buffer
└── circuit-breaker-state/      # Circuit breaker state files
```

### Pattern 1: Daemon as Local Aggregator (New Relic Model)
**What:** Local daemon receives profiling data from multiple PHP requests via Unix socket, aggregates in memory, sends batches to central listener
**When to use:** When you want to decouple PHP application from central listener availability, reduce network connections, implement system-wide circuit breaking
**Benefits:**
- PHP requests never block on central listener availability (fire-and-forget to local daemon)
- Daemon buffers data when central listener is down, replays when available
- One network connection per batch vs per request (reduces overhead)
- Circuit breaker can disable profiling globally without touching PHP-FPM

**Example Architecture:**
```
PHP Request 1 ──┐
PHP Request 2 ──┼──> Unix Socket ──> Local Daemon ──> Central Listener
PHP Request 3 ──┘                     (Buffers, batches,
                                       circuit breaker)
```

**Code Example:**
```php
// Source: https://reactphp.org/socket/
// daemon/daemon.php - Main daemon with ReactPHP

require __DIR__ . '/../vendor/autoload.php';

use React\EventLoop\Loop;
use React\Socket\UnixServer;

// Setup signal handlers first
pcntl_async_signals(true);
$shutdown = false;

pcntl_signal(SIGTERM, function() use (&$shutdown) {
    echo "Received SIGTERM, shutting down gracefully...\n";
    $shutdown = true;
});

pcntl_signal(SIGHUP, function() {
    echo "Received SIGHUP, reloading configuration...\n";
    // Reload config logic here
});

// Create memory buffer for profiling data
$buffer = [];
$bufferMaxSize = 100; // Batch size before sending

// Create Unix domain socket server
$socket = new UnixServer('/var/run/bitville-apm/listener.sock');
echo "Daemon listening on /var/run/bitville-apm/listener.sock\n";

$socket->on('connection', function (React\Socket\ConnectionInterface $connection) use (&$buffer, $bufferMaxSize) {
    $connection->on('data', function ($data) use (&$buffer, $bufferMaxSize) {
        // Parse incoming profiling data
        $profilingData = json_decode($data, true);

        if ($profilingData) {
            $buffer[] = $profilingData;

            // Flush buffer when full
            if (count($buffer) >= $bufferMaxSize) {
                sendToCircuitBreaker($buffer);
                $buffer = [];
            }
        }
    });
});

// Periodic buffer flush (every 5 seconds)
Loop::addPeriodicTimer(5.0, function () use (&$buffer) {
    if (!empty($buffer)) {
        sendToCircuitBreaker($buffer);
        $buffer = [];
    }
});

// Memory monitoring and worker restart logic
Loop::addPeriodicTimer(10.0, function () use (&$shutdown) {
    $memoryUsage = memory_get_usage(true);
    $memoryLimit = 256 * 1024 * 1024; // 256MB

    if ($memoryUsage > $memoryLimit) {
        echo "Memory threshold exceeded: " . ($memoryUsage / 1024 / 1024) . "MB\n";
        $shutdown = true;
    }
});

// Graceful shutdown check
Loop::addPeriodicTimer(1.0, function () use (&$shutdown, &$buffer, $socket) {
    if ($shutdown) {
        echo "Flushing buffer and shutting down...\n";

        // Flush remaining buffer to disk
        if (!empty($buffer)) {
            writeToDiskBuffer($buffer);
        }

        $socket->close();
        Loop::stop();
    }
});

// Start event loop
Loop::run();
```

### Pattern 2: Worker Lifecycle Management with Memory Thresholds
**What:** Daemon monitors its own memory usage and gracefully restarts when threshold exceeded, preventing memory leaks
**When to use:** For long-running PHP processes that may accumulate memory over time
**Example:**
```php
// Source: https://medium.com/@devOpsIsRil/why-pm-max-requests-matters-in-php-fpm-and-what-breaks-if-you-ignore-it-most-php-fpm-a1aa261c7612
// Supervisord configuration handles restart, daemon monitors itself

// daemon/worker_manager.php
class WorkerManager {
    private $requestCount = 0;
    private $maxRequests = 1000;
    private $memoryLimit = 256 * 1024 * 1024; // 256MB

    public function shouldRestart(): bool {
        // Check request count
        if ($this->requestCount >= $this->maxRequests) {
            error_log("Request limit reached: {$this->requestCount}");
            return true;
        }

        // Check memory usage
        $memoryUsage = memory_get_usage(true);
        if ($memoryUsage > $this->memoryLimit) {
            error_log("Memory limit reached: " . ($memoryUsage / 1024 / 1024) . "MB");
            return true;
        }

        return false;
    }

    public function incrementRequests() {
        $this->requestCount++;
    }

    public function runGarbageCollection() {
        gc_collect_cycles();
    }
}
```

### Pattern 3: Circuit Breaker for Auto-Disable
**What:** Track consecutive failures sending to central listener, automatically disable profiling after threshold
**When to use:** To prevent profiling system from impacting production when central listener is down
**Example:**
```php
// Source: https://github.com/eljam/circuit-breaker
// daemon/circuit_breaker.php

use Eljam\CircuitBreaker\Breaker;
use Doctrine\Common\Cache\FilesystemCache;

class ProfilingCircuitBreaker {
    private $breaker;

    public function __construct() {
        $cache = new FilesystemCache('/var/lib/bitville-apm/circuit-breaker-state');

        $this->breaker = new Breaker(
            'central_listener',
            [
                'failure_threshold' => 5,      // Open after 5 failures
                'retry_timeout' => 60,         // Try again after 60 seconds
                'ignore_exceptions' => false,  // Propagate exceptions
            ],
            $cache
        );
    }

    public function sendData(array $profilingData): bool {
        try {
            $result = $this->breaker->protect(function() use ($profilingData) {
                return $this->transmitToCentralListener($profilingData);
            });

            return $result;
        } catch (\Exception $e) {
            // Circuit breaker opened, write to disk buffer
            error_log("Circuit breaker open: " . $e->getMessage());
            $this->writeToDiskBuffer($profilingData);
            return false;
        }
    }

    private function transmitToCentralListener(array $data): bool {
        // Send to Phase 3 central listener
        $socket = socket_create(AF_UNIX, SOCK_DGRAM, 0);

        socket_set_option($socket, SOL_SOCKET, SO_SNDTIMEO, [
            'sec' => 0,
            'usec' => 50000  // 50ms timeout
        ]);

        $jsonData = json_encode($data);
        $result = @socket_sendto(
            $socket,
            $jsonData,
            strlen($jsonData),
            0,
            '/var/run/bitville-apm/central-listener.sock'
        );

        socket_close($socket);

        if ($result === false) {
            throw new \RuntimeException("Failed to send to central listener");
        }

        return true;
    }

    private function writeToDiskBuffer(array $data) {
        $tempFile = tempnam('/var/lib/bitville-apm/buffer', 'profiling_');
        file_put_contents($tempFile, json_encode($data), LOCK_EX);
    }
}
```

### Pattern 4: Disk-Assisted Buffering Strategy
**What:** Memory buffer with automatic overflow to disk when full or on daemon shutdown
**When to use:** To handle temporary central listener unavailability without data loss
**Example:**
```php
// Source: https://axoflow.com/docs/axosyslog-core/chapter-routing-filters/concepts-diskbuffer/
// daemon/buffer_manager.php

class BufferManager {
    private $memoryBuffer = [];
    private $memoryBufferLimit = 100;
    private $diskBufferPath = '/var/lib/bitville-apm/buffer/';

    public function add(array $data): void {
        $this->memoryBuffer[] = $data;

        // Overflow to disk if memory buffer full
        if (count($this->memoryBuffer) >= $this->memoryBufferLimit) {
            $this->flushToDisk();
        }
    }

    public function flush(): array {
        $data = $this->memoryBuffer;
        $this->memoryBuffer = [];
        return $data;
    }

    public function flushToDisk(): void {
        if (empty($this->memoryBuffer)) {
            return;
        }

        $filename = $this->diskBufferPath . 'buffer_' . microtime(true) . '.json';
        file_put_contents($filename, json_encode($this->memoryBuffer), LOCK_EX);

        error_log("Buffer overflowed to disk: {$filename}");
        $this->memoryBuffer = [];
    }

    public function replayDiskBuffer(): void {
        $files = glob($this->diskBufferPath . 'buffer_*.json');

        foreach ($files as $file) {
            $data = json_decode(file_get_contents($file), true);

            if ($data) {
                // Try to send buffered data
                $success = $this->sendToCentralListener($data);

                if ($success) {
                    unlink($file);
                }
            }
        }
    }
}
```

### Pattern 5: Supervisord Configuration for PHP Daemon
**What:** Configure supervisord to manage daemon lifecycle, auto-restart on failure
**When to use:** Production deployment of PHP daemons
**Example:**
```ini
; Source: https://supervisord.org/subprocess.html
; config/supervisord.conf

[program:bitville-apm-daemon]
command=/usr/bin/php /var/www/project/profiling/daemon/daemon.php
user=www-data
autostart=true
autorestart=true
startretries=999999
redirect_stderr=true
stdout_logfile=/var/log/bitville-apm/daemon.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
environment=PATH="/usr/bin:/usr/local/bin"

; Graceful shutdown configuration
stopsignal=TERM
stopwaitsecs=30

; Memory-based restart (supervisord doesn't support this directly)
; Daemon must exit when memory threshold reached, supervisord will restart
```

### Pattern 6: Systemd Unit File Alternative
**What:** Use systemd instead of supervisord for daemon management
**When to use:** When supervisord not available or system-level integration needed
**Example:**
```ini
; Source: https://dev.to/iam_krishnan/running-a-php-script-or-worker-as-a-systemd-service-pf7
; config/bitville-apm-daemon.service

[Unit]
Description=Bitville APM Daemon
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/project/profiling/daemon
ExecStart=/usr/bin/php /var/www/project/profiling/daemon/daemon.php
Restart=always
RestartSec=5

; Graceful shutdown
TimeoutStopSec=30

; Restart limits (systemd gives up after 5 failures in 10 seconds by default)
StartLimitIntervalSec=0

; Environment
Environment="PATH=/usr/bin:/usr/local/bin"

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Pattern 7: Periodic Garbage Collection for Long-Running Process
**What:** Manually trigger PHP garbage collection to prevent memory accumulation
**When to use:** Long-running PHP daemons that handle many operations
**Example:**
```php
// Source: https://dev.to/arasosman/laravel-octane-15-advanced-configuration-techniques-for-maximum-performance-5974
// In daemon event loop

Loop::addPeriodicTimer(60.0, function () {
    // Force garbage collection every 60 seconds
    gc_collect_cycles();

    $memoryUsage = memory_get_usage(true) / 1024 / 1024;
    error_log("GC completed. Memory usage: {$memoryUsage}MB");
});

// Alternative: Increase GC threshold for better performance
ini_set('zend.enable_gc', '1');
ini_set('gc_mem_caches', '10'); // Increase from default 2
```

### Anti-Patterns to Avoid
- **Don't use blocking socket operations in event loop:** ReactPHP's event loop requires non-blocking I/O, blocking sockets will freeze the entire daemon
- **Don't skip supervisord/systemd:** Custom fork/exec daemon code is complex and error-prone, use mature process managers
- **Don't ignore memory thresholds:** Long-running PHP processes leak memory, always implement worker recycling
- **Don't flush buffer synchronously on every message:** Batching reduces network overhead and improves performance
- **Don't use SOCK_STREAM without connection management:** SOCK_DGRAM (datagram) is simpler for fire-and-forget, no connection tracking needed
- **Don't hardcode socket paths:** Use configuration file so paths can be changed for different environments

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event loop for async I/O | Custom select() loop | ReactPHP EventLoop | Handles edge cases, timer management, cross-platform compatibility |
| Circuit breaker pattern | Simple failure counter | eljam/circuit-breaker | Handles half-open state, retry timeouts, multiprocess state |
| Process supervision | Custom fork/exec with pidfiles | supervisord or systemd | Automatic restart, log rotation, signal handling, resource limits |
| Socket server | Raw socket_create + accept loop | reactphp/socket | Connection management, graceful shutdown, error handling |
| Signal handling | Basic pcntl_signal() | pcntl_async_signals(true) | No performance overhead from declare(ticks=1) |
| Disk buffer cleanup | Custom cron job | systemd-tmpfiles or tmpwatch | Standard cleanup mechanisms, age-based deletion |

**Key insight:** PHP daemon development has mature libraries (ReactPHP) and standard process managers (supervisord, systemd) that handle the complex edge cases. The industry standard is daemon-based architecture for PHP APM (see New Relic), not direct transmission from PHP-FPM processes.

## Common Pitfalls

### Pitfall 1: Blocking Operations in ReactPHP Event Loop
**What goes wrong:** Using blocking socket operations, file I/O, or database queries inside ReactPHP event loop freezes entire daemon
**Why it happens:** ReactPHP uses single-threaded event loop, any blocking operation stops all event processing
**How to avoid:** Use ReactPHP's async components (react/socket, react/filesystem, react/mysql), never use blocking file_get_contents() or sleep()
**Warning signs:** Daemon stops responding during I/O operations, all connections hang when one is slow, CPU usage drops to 0% during blocking

### Pitfall 2: Unix Socket Permission Errors
**What goes wrong:** Daemon creates Unix socket but PHP-FPM processes can't connect due to permission mismatch
**Why it happens:** Daemon runs as one user (e.g., www-data), socket created with restrictive permissions
**How to avoid:** After socket creation, chmod 0666 the socket file, or ensure daemon runs as same user as PHP-FPM
**Warning signs:** "Permission denied" errors in PHP error_log, socket exists but connections fail, listener.php fallback to disk buffer

### Pitfall 3: Supervisord Restart Loop on Configuration Errors
**What goes wrong:** Daemon exits immediately on startup due to config error, supervisord restarts it repeatedly, fills logs
**Why it happens:** Supervisord's autorestart=true restarts on any exit, including configuration errors
**How to avoid:** Validate configuration before daemon enters event loop, exit with specific error codes, set startretries limit
**Warning signs:** Daemon log shows same startup error repeatedly, supervisord status shows "BACKOFF" state, high CPU usage from constant restarts

### Pitfall 4: Memory Leak from Closure References in Event Loop
**What goes wrong:** Event loop timers or connection handlers capture references to large objects, preventing garbage collection
**Why it happens:** PHP closures capture variables by reference, ReactPHP keeps closures alive for the daemon's lifetime
**How to avoid:** Use WeakReference for large objects, manually unset variables after use, periodically restart worker
**Warning signs:** Memory usage grows linearly with uptime despite gc_collect_cycles(), memory doesn't decrease after timer execution, memory_get_usage() shows 100MB+ after 24 hours

### Pitfall 5: Circuit Breaker State Not Shared Across Restarts
**What goes wrong:** Daemon restarts, circuit breaker resets to closed state, immediately hits failing central listener again
**Why it happens:** Circuit breaker state stored in memory, lost on daemon restart
**How to avoid:** Use Doctrine FilesystemCache or Redis for circuit breaker state, persists across restarts
**Warning signs:** Daemon repeatedly tries to send to unavailable central listener after restart, no "circuit open" logs after daemon restart, buffered data grows unbounded

### Pitfall 6: SIGTERM During Buffer Flush Causes Data Loss
**What goes wrong:** Daemon receives SIGTERM while flushing buffer, exits mid-write, partial or corrupted data written to disk
**Why it happens:** Signal handlers are asynchronous, can interrupt any operation
**How to avoid:** Set flag in signal handler, check flag in event loop, complete buffer flush before exiting, use atomic file writes (tempnam + rename)
**Warning signs:** Corrupted JSON in disk buffer files, partial profiling data, "Unexpected end of file" errors when reading buffer, data loss during daemon restart

### Pitfall 7: Supervisord stopwaitsecs Too Short
**What goes wrong:** Supervisord sends SIGTERM, waits 10 seconds (default), sends SIGKILL, daemon killed before graceful shutdown completes
**Why it happens:** Default stopwaitsecs=10 insufficient for buffer flush and cleanup
**How to avoid:** Set stopwaitsecs=30 or higher, monitor shutdown duration, ensure graceful shutdown completes within timeout
**Warning signs:** "FATAL Exited too quickly" in supervisord log, data loss during shutdown, buffer not flushed to disk, incomplete log entries

### Pitfall 8: ReactPHP Socket Server Doesn't Remove Old Socket File
**What goes wrong:** Daemon crashes or is killed -9, socket file remains, daemon fails to start with "Address already in use"
**Why it happens:** Unix socket files aren't automatically cleaned up, new daemon tries to bind to existing file
**How to avoid:** Check for existing socket file on startup with file_exists(), unlink() if exists and not in use, or use systemd socket activation
**Warning signs:** "Address already in use" error on daemon start, socket file exists after daemon stopped, manual `rm` required to restart daemon

## Code Examples

Verified patterns from official sources:

### ReactPHP Unix Socket Server with Signal Handling
```php
// Source: https://reactphp.org/socket/
// Complete daemon example with graceful shutdown

require __DIR__ . '/../vendor/autoload.php';

use React\EventLoop\Loop;
use React\Socket\UnixServer;

// Enable async signal handling
pcntl_async_signals(true);
$shouldShutdown = false;

pcntl_signal(SIGTERM, function() use (&$shouldShutdown) {
    echo "Received SIGTERM\n";
    $shouldShutdown = true;
});

// Remove old socket file if exists
$socketPath = '/var/run/bitville-apm/listener.sock';
if (file_exists($socketPath)) {
    unlink($socketPath);
}

// Create Unix domain socket server
$server = new UnixServer($socketPath);

// Set socket permissions for PHP-FPM access
chmod($socketPath, 0666);

echo "Daemon listening on {$socketPath}\n";

$server->on('connection', function (React\Socket\ConnectionInterface $connection) {
    $connection->on('data', function ($data) {
        echo "Received: {$data}\n";
        // Process profiling data
    });
});

// Graceful shutdown check
Loop::addPeriodicTimer(1.0, function () use (&$shouldShutdown, $server, $socketPath) {
    if ($shouldShutdown) {
        echo "Shutting down...\n";
        $server->close();
        unlink($socketPath);
        Loop::stop();
    }
});

Loop::run();
```

### Circuit Breaker with Filesystem State
```php
// Source: https://github.com/eljam/circuit-breaker

use Eljam\CircuitBreaker\Breaker;
use Doctrine\Common\Cache\FilesystemCache;

$cache = new FilesystemCache('/var/lib/bitville-apm/circuit-breaker-state');

$breaker = new Breaker(
    'central_listener',
    [
        'failure_threshold' => 5,  // Open after 5 consecutive failures
        'retry_timeout' => 60,     // Try again after 60 seconds
        'ignore_exceptions' => false,
    ],
    $cache
);

// Protected function call
try {
    $result = $breaker->protect(function() {
        // Send to central listener
        return sendToCentralListener($data);
    });
} catch (\Exception $e) {
    // Circuit is open, fallback to disk buffer
    writeToDiskBuffer($data);
}
```

### Worker Memory and Request Limit Check
```php
// Source: https://medium.com/@devOpsIsRil/why-pm-max-requests-matters-in-php-fpm-and-what-breaks-if-you-ignore-it-most-php-fpm-a1aa261c7612

class WorkerLifecycle {
    private $requestCount = 0;
    private $maxRequests = 1000;
    private $memoryLimit = 256 * 1024 * 1024; // 256MB

    public function shouldRestart(): bool {
        if ($this->requestCount >= $this->maxRequests) {
            error_log("Request limit reached, restarting worker");
            return true;
        }

        $memory = memory_get_usage(true);
        if ($memory > $this->memoryLimit) {
            error_log("Memory limit reached: " . ($memory / 1024 / 1024) . "MB");
            return true;
        }

        return false;
    }

    public function processRequest() {
        $this->requestCount++;

        // Run GC every 100 requests
        if ($this->requestCount % 100 === 0) {
            gc_collect_cycles();
        }
    }
}
```

### Supervisord Configuration with Graceful Shutdown
```ini
; Source: https://supervisord.org/subprocess.html

[program:bitville-apm-daemon]
command=/usr/bin/php /var/www/project/profiling/daemon/daemon.php
directory=/var/www/project/profiling/daemon
user=www-data
autostart=true
autorestart=true
startretries=999999
redirect_stderr=true
stdout_logfile=/var/log/bitville-apm/daemon.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5

; Graceful shutdown
stopsignal=TERM
stopwaitsecs=30

; Process priority
priority=999
```

### Signal Handler with Critical Section Protection
```php
// Source: https://www.php.net/manual/en/function.pcntl-signal.php

pcntl_async_signals(true);

$allowExit = true;
$forceExit = false;

pcntl_signal(SIGTERM, function() use (&$allowExit, &$forceExit) {
    global $allowExit, $forceExit;

    if ($allowExit) {
        exit(0);
    } else {
        // Defer exit until safe
        $forceExit = true;
    }
});

// Critical section
$allowExit = false;
// ... flush buffer, close connections ...
$allowExit = true;

// Check for deferred exit
if ($forceExit && $allowExit) {
    exit(0);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| declare(ticks=1) for signals | pcntl_async_signals(true) | PHP 7.1+ (2016) | No performance overhead, signals handled between opcodes |
| Custom fork/exec daemon | supervisord or systemd | Ongoing | Standard process management, automatic restart, log rotation |
| Direct transmission from agent | Local daemon aggregator | New Relic model | Buffering, batching, reduced network connections, circuit breaking |
| Blocking socket I/O | ReactPHP event loop | 2012+ | Async I/O without threads, handles concurrent connections |
| pm.max_requests=0 (unlimited) | pm.max_requests=1000+ | 2024-2026 best practice | Prevents memory leaks in long-running PHP-FPM workers |

**Deprecated/outdated:**
- **declare(ticks=1)**: Performance overhead, replaced by pcntl_async_signals() in PHP 7.1+
- **Custom daemon with fork/exec**: Complex, error-prone, replaced by supervisord/systemd
- **PHP-PM (PHP Process Manager)**: Archived project, ReactPHP or Swoole preferred for modern async PHP
- **Unlimited worker lifetime (pm.max_requests=0)**: Memory leak risk, modern practice requires worker recycling

## Open Questions

Things that couldn't be fully resolved:

1. **ReactPHP UDP socket support for SOCK_DGRAM**
   - What we know: ReactPHP socket component focuses on TCP/IP and TLS, separate Datagram component exists (v1.10.0)
   - What's unclear: Whether react/datagram supports Unix domain SOCK_DGRAM sockets, or only UDP over network
   - Recommendation: Start with ReactPHP UnixServer (SOCK_STREAM), verify it works for our use case, evaluate SOCK_DGRAM if stream protocol proves problematic

2. **Optimal buffer size for batching profiling data**
   - What we know: Batching reduces network overhead, but larger batches increase memory usage and delay
   - What's unclear: Sweet spot between memory usage, latency, and network efficiency (100 items? 1000?)
   - Recommendation: Start with 100 items or 5-second timeout (whichever comes first), measure and tune based on profiling volume

3. **Circuit breaker threshold for profiling system**
   - What we know: Circuit breaker should open after consecutive failures, but threshold depends on acceptable downtime
   - What's unclear: Whether 5 failures is appropriate for profiling system, or if higher threshold needed
   - Recommendation: Start with 5 consecutive failures over 60 second window, monitor false positives, adjust if circuit opens too frequently

4. **Worker restart frequency: requests vs time-based**
   - What we know: PHP-FPM uses pm.max_requests (1000-50000), but daemon processes often use time-based restarts (24 hours)
   - What's unclear: Whether request-based (1000 requests) or time-based (24 hours) better for profiling daemon
   - Recommendation: Use hybrid approach: 1000 requests OR 256MB memory OR 24 hours, whichever comes first

5. **Disk buffer replay strategy**
   - What we know: Circuit breaker opens when central listener unavailable, data written to disk buffer
   - What's unclear: When to replay buffered data (on circuit close? periodic retry? daemon restart?), and in what order (FIFO? priority?)
   - Recommendation: Replay on circuit transition from open to half-open, process oldest files first (FIFO), limit replay rate to avoid overwhelming central listener

6. **Socket backlog size for Unix domain socket**
   - What we know: socket_listen() accepts backlog parameter, controls queued connections when daemon busy
   - What's unclear: Appropriate backlog size for profiling socket under load (default 128? higher?)
   - Recommendation: Start with default backlog (128), monitor for "connection refused" errors under peak load, increase if needed

## Sources

### Primary (HIGH confidence)
- ReactPHP Socket Documentation - https://reactphp.org/socket/
- ReactPHP EventLoop Documentation - https://reactphp.org/event-loop/
- PHP Manual: pcntl_signal - https://www.php.net/manual/en/function.pcntl-signal.php
- Supervisord Subprocess Documentation - https://supervisord.org/subprocess.html
- New Relic Daemon Processes - https://docs.newrelic.com/docs/apm/agents/php-agent/getting-started/new-relic-daemon-processes/
- eljam/circuit-breaker GitHub - https://github.com/eljam/circuit-breaker

### Secondary (MEDIUM confidence)
- Laravel Octane Memory Management - https://dev.to/arasosman/laravel-octane-15-advanced-configuration-techniques-for-maximum-performance-5974
- PHP-FPM max_requests Configuration - https://medium.com/@devOpsIsRil/why-pm-max-requests-matters-in-php-fpm-and-what-breaks-if-you-ignore-it-most-php-fpm-a1aa261c7612
- Systemd Unit File Configuration - https://dev.to/iam_krishnan/running-a-php-script-or-worker-as-a-systemd-service-pf7
- Disk-Assisted Buffering - https://axoflow.com/docs/axosyslog-core/chapter-routing-filters/concepts-diskbuffer/
- OpenTelemetry Collector Architecture - https://opentelemetry.io/docs/collector/architecture/
- Datadog Agent Architecture - https://docs.datadoghq.com/agent/architecture/

### Tertiary (LOW confidence)
- OpenSwoole Server Configuration - https://openswoole.com/docs/modules/swoole-server/configuration
- ReactPHP Memory Leak Discussion - https://github.com/reactphp/reactphp/issues/94
- PHP Long Running Process Patterns - https://medium.com/beyn-technology/maintain-the-php-apps-as-daemon-f8f4d68963d4
- Supervisord Management Guide - https://medium.com/@dharmilshiroya/getting-started-with-supervisor-on-linux-with-installation-process-and-example-2965c4540bd9

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - ReactPHP and supervisord verified in official documentation, industry-proven
- Architecture patterns: MEDIUM - New Relic daemon model confirmed, but specific implementation details require validation
- Daemon necessity: HIGH - Industry standard (New Relic, Datadog) uses local daemon for PHP APM, direct transmission not suitable for request-scoped agents
- Worker lifecycle: HIGH - PHP-FPM patterns well-documented, memory threshold best practices established
- Circuit breaker: MEDIUM - Library verified, but configuration thresholds need testing in production environment

**Research date:** 2026-01-27
**Valid until:** 2026-02-13 (15 days for evolving PHP daemon patterns, ReactPHP stable)

**Critical decision:** Phase 2 SHOULD implement a local daemon on each web server. The daemon provides essential buffering, circuit breaking, and worker lifecycle management that can't be achieved with direct transmission from listener.php. This matches industry standard (New Relic) and provides resilience when the central listener is temporarily unavailable.

**Architecture decision rationale:**
- **Local daemon needed:** YES - provides buffering, circuit breaker, aggregation, worker lifecycle management
- **Direct transmission not suitable:** listener.php in PHP-FPM process can't implement circuit breaker globally, can't aggregate across requests, can't handle backpressure from central listener
- **New Relic model is proven:** Production PHP APM systems use local daemon, not direct transmission
- **Phase 1 + Phase 2 integration:** listener.php sends to local daemon via Unix socket (Phase 1 already has socket code), daemon handles everything else
