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

// Use statements
use React\EventLoop\Loop;

// Configuration constants
define('DAEMON_SOCKET_PATH', '/var/run/bitville-apm/daemon.sock');
define('DAEMON_MEMORY_LIMIT_MB', 256);
define('DAEMON_MAX_REQUESTS', 1000);
define('DAEMON_GC_INTERVAL', 100);

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

// Initialize WorkerLifecycle
$workerLifecycle = new WorkerLifecycle(
    DAEMON_MAX_REQUESTS,
    DAEMON_MEMORY_LIMIT_MB,
    DAEMON_GC_INTERVAL
);

// Data handler callback (placeholder for now - will be extended in Plan 02-02)
$onDataReceived = function(array $profilingData) use ($workerLifecycle) {
    $workerLifecycle->incrementRequests();

    // TODO: Plan 02-02 will add buffer management here
    // For now, just log receipt
    $correlationId = $profilingData['correlation_id'] ?? 'unknown';
    error_log("BitvilleAPM: Received profiling data for request {$correlationId}");
};

// Initialize SocketServer
$socketServer = new SocketServer(DAEMON_SOCKET_PATH, $onDataReceived);
$socketServer->start();

// Check for graceful shutdown every 1 second
Loop::addPeriodicTimer(1.0, function() use (&$shouldShutdown, $socketServer, $workerLifecycle) {
    if ($shouldShutdown) {
        error_log("BitvilleAPM: Shutting down...");
        // TODO: Plan 02-02 will flush buffers here
        $socketServer->stop();
        Loop::stop();
        return;
    }

    // Check if worker should restart (memory/request limits)
    if ($workerLifecycle->shouldRestart()) {
        error_log("BitvilleAPM: Worker restart triggered, exiting for supervisor to restart...");
        $socketServer->stop();
        Loop::stop();
        exit(0); // Clean exit, supervisor will restart
    }
});

// Log stats every 60 seconds
Loop::addPeriodicTimer(60.0, function() use ($workerLifecycle) {
    $stats = $workerLifecycle->getStats();
    error_log(sprintf(
        "BitvilleAPM: Stats - requests: %d, memory: %.1fMB, gc_runs: %d",
        $stats['request_count'],
        $stats['memory_usage_mb'],
        $stats['gc_runs']
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
