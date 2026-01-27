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

// Use statements
use React\EventLoop\Loop;

// Configuration constants
define('DAEMON_SOCKET_PATH', '/var/run/bitville-apm/daemon.sock');
define('DAEMON_MEMORY_LIMIT_MB', 256);
define('DAEMON_MAX_REQUESTS', 1000);
define('DAEMON_GC_INTERVAL', 100);
define('DAEMON_BUFFER_LIMIT', 100);
define('DAEMON_BUFFER_PATH', '/var/lib/bitville-apm/buffer');

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
Loop::addPeriodicTimer(60.0, function() use ($workerLifecycle, $bufferManager) {
    $stats = $workerLifecycle->getStats();
    $bufferStats = $bufferManager->getStats();
    error_log(sprintf(
        "BitvilleAPM: Stats - requests: %d, memory: %.1fMB, gc_runs: %d, buffer: %d/%d, disk_overflows: %d",
        $stats['request_count'],
        $stats['memory_usage_mb'],
        $stats['gc_runs'],
        $bufferStats['memory_buffer_count'],
        $bufferStats['memory_buffer_limit'],
        $bufferStats['disk_overflow_count']
    ));
});

// Startup message
error_log("BitvilleAPM: Daemon starting...");
error_log(sprintf(
    "BitvilleAPM: Config - socket: %s, memory_limit: %dMB, max_requests: %d",
    DAEMON_SOCKET_PATH,
    DAEMON_MEMORY_LIMIT_MB,
    DAEMON_MAX_REQUESTS
));

// Run the event loop
Loop::run();

error_log("BitvilleAPM: Daemon stopped");
