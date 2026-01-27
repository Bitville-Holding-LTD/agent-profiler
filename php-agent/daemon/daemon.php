#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Bitville APM Daemon
 *
 * Background daemon that receives profiling data from listener.php via Unix socket,
 * buffers it, and forwards to central listener.
 *
 * Features:
 * - ReactPHP event loop for async operation
 * - Worker lifecycle management (memory/request limits)
 * - Signal handling (SIGTERM, SIGHUP)
 * - Periodic garbage collection
 * - Graceful shutdown
 */

// Require dependencies
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/socket_server.php';
require_once __DIR__ . '/worker_lifecycle.php';
require_once __DIR__ . '/buffer_manager.php';
require_once __DIR__ . '/transmitter.php';
require_once __DIR__ . '/health_check.php';

// Use statements
use React\EventLoop\Loop;

// Configuration constants
define('DAEMON_SOCKET_PATH', '/var/run/bitville-apm/daemon.sock');
define('DAEMON_MEMORY_LIMIT_MB', 256);
define('DAEMON_MAX_REQUESTS', 1000);
define('DAEMON_GC_INTERVAL', 100);
define('DAEMON_BUFFER_LIMIT', 100);
define('DAEMON_BUFFER_PATH', '/var/lib/bitville-apm/buffer');
define('DAEMON_HEALTH_PORT', 9191);
define('DAEMON_FLUSH_INTERVAL', 5); // seconds
define('DAEMON_LISTENER_URL', 'http://localhost:8080/api/profiling'); // Phase 3 will provide real URL

// Signal handling setup (BEFORE event loop)
pcntl_async_signals(true);
$shouldShutdown = false;

pcntl_signal(SIGTERM, function() use (&$shouldShutdown) {
    error_log("BitvilleAPM: Received SIGTERM, initiating graceful shutdown...");
    $shouldShutdown = true;
});

pcntl_signal(SIGHUP, function() {
    error_log("BitvilleAPM: Received SIGHUP (reload not implemented yet)");
});

// Create runtime directory if needed
$runtimeDir = dirname(DAEMON_SOCKET_PATH);
if (!is_dir($runtimeDir)) {
    if (!@mkdir($runtimeDir, 0755, true)) {
        error_log("BitvilleAPM: Failed to create runtime directory: $runtimeDir");
        exit(1);
    }
}

// Create buffer directory if needed
if (!is_dir(DAEMON_BUFFER_PATH)) {
    @mkdir(DAEMON_BUFFER_PATH, 0755, true);
}

// Initialize WorkerLifecycle
$workerLifecycle = new WorkerLifecycle(
    DAEMON_MAX_REQUESTS,
    DAEMON_MEMORY_LIMIT_MB,
    DAEMON_GC_INTERVAL
);

// Initialize BufferManager
$bufferManager = new BufferManager(DAEMON_BUFFER_LIMIT, DAEMON_BUFFER_PATH);

// Create circuit breaker and transmitter
$circuitBreaker = new CircuitBreaker('central_listener');
$transmitter = new DaemonTransmitter(DAEMON_LISTENER_URL, 5, $circuitBreaker);

// Create stats callback for health check
$getStats = function() use ($workerLifecycle, $bufferManager, $circuitBreaker) {
    return [
        'worker' => $workerLifecycle->getStats(),
        'buffer' => $bufferManager->getStats(),
        'circuit_breaker' => $circuitBreaker->getStats(),
    ];
};

// Start health check server
$healthCheck = new HealthCheckServer(DAEMON_HEALTH_PORT, $getStats);
$healthCheck->start();

// Data handler callback - add received data to buffer
$onDataReceived = function(array $profilingData) use ($workerLifecycle, $bufferManager) {
    $workerLifecycle->incrementRequests();
    $bufferManager->add($profilingData);

    $correlationId = $profilingData['correlation_id'] ?? 'unknown';
    error_log("BitvilleAPM: Buffered profiling data for request {$correlationId}");
};

// Replay any existing disk buffer from previous run
error_log("BitvilleAPM: Checking for buffered data from previous run...");
$replayedCount = $bufferManager->replayDiskBuffer(function($item) use ($bufferManager) {
    // Re-add to memory buffer for processing by circuit breaker (Plan 02-03)
    $bufferManager->add($item);
});
if ($replayedCount > 0) {
    error_log("BitvilleAPM: Replayed {$replayedCount} items from disk buffer");
}

// Initialize SocketServer
$socketServer = new SocketServer(DAEMON_SOCKET_PATH, $onDataReceived);
$socketServer->start();

// Drain buffer and transmit every N seconds
Loop::addPeriodicTimer(DAEMON_FLUSH_INTERVAL, function() use ($bufferManager, $transmitter, $circuitBreaker) {
    // Skip if circuit breaker is open
    if (!$circuitBreaker->isAvailable()) {
        return;
    }

    // Flush memory buffer
    $items = $bufferManager->flush();
    if (empty($items)) {
        return;
    }

    // Transmit each item
    $success = 0;
    $failed = 0;
    foreach ($items as $item) {
        if ($transmitter->send($item)) {
            $success++;
        } else {
            $failed++;
            // Re-add failed item to buffer
            $bufferManager->add($item);

            // Stop if circuit opened
            if (!$circuitBreaker->isAvailable()) {
                error_log("BitvilleAPM: Circuit opened during transmission, re-buffering remaining items");
                // Re-add remaining items
                foreach (array_slice($items, $success + $failed) as $remaining) {
                    $bufferManager->add($remaining);
                }
                break;
            }
        }
    }

    if ($success > 0 || $failed > 0) {
        error_log("BitvilleAPM: Transmitted {$success} items, {$failed} failed");
    }
});

// Check for graceful shutdown every 1 second
Loop::addPeriodicTimer(1.0, function() use (&$shouldShutdown, $socketServer, $workerLifecycle, $bufferManager) {
    if ($shouldShutdown) {
        error_log("BitvilleAPM: Shutting down...");
        // Flush remaining buffer to disk before exit
        $bufferManager->flushToDisk();
        error_log("BitvilleAPM: Buffer flushed to disk");
        $socketServer->stop();
        Loop::stop();
        return;
    }

    // Check if worker should restart (memory/request limits)
    if ($workerLifecycle->shouldRestart()) {
        error_log("BitvilleAPM: Worker restart triggered, flushing buffer...");
        $bufferManager->flushToDisk();
        $socketServer->stop();
        Loop::stop();
        exit(0); // Clean exit, supervisor will restart
    }
});

// Log stats every 60 seconds
Loop::addPeriodicTimer(60.0, function() use ($workerLifecycle, $bufferManager, $circuitBreaker) {
    $stats = $workerLifecycle->getStats();
    $bufferStats = $bufferManager->getStats();
    $cbStats = $circuitBreaker->getStats();
    error_log(sprintf(
        "BitvilleAPM: Stats - requests: %d, memory: %.1fMB, gc_runs: %d, buffer: %d/%d, circuit: %s",
        $stats['request_count'],
        $stats['memory_usage_mb'],
        $stats['gc_runs'],
        $bufferStats['memory_buffer_count'],
        $bufferStats['memory_buffer_limit'],
        $cbStats['state']
    ));
});

// Startup message
error_log("BitvilleAPM: Daemon starting...");
error_log(sprintf(
    "BitvilleAPM: Config - socket: %s, memory_limit: %dMB, max_requests: %d, health: http://127.0.0.1:%d/health",
    DAEMON_SOCKET_PATH,
    DAEMON_MEMORY_LIMIT_MB,
    DAEMON_MAX_REQUESTS,
    DAEMON_HEALTH_PORT
));

// Run the event loop
Loop::run();

error_log("BitvilleAPM: Daemon stopped");
