<?php
/**
 * Profiling Data Transmitter
 *
 * Sends profiling data to listener daemon via Unix domain socket
 * with strict 50ms timeout and disk buffer fallback
 *
 * CRITICAL: This code must NEVER block the request or throw errors
 */

require_once __DIR__ . '/config.php';

// Timeout in microseconds (50ms)
define('TRANSMIT_TIMEOUT_USEC', 50000);

// Max size for datagram (64KB is typical limit)
define('MAX_DATAGRAM_SIZE', 65507);

/**
 * Send profiling data to listener daemon
 *
 * @param array $data Profiling data to send
 * @return bool True if sent to socket, false if fell back to disk
 */
function send_profiling_data(array $data): bool
{
    try {
        $config = get_profiling_config();
        $socketPath = $config['listener_socket_path'] ?? '/var/run/bitville-apm/listener.sock';

        // Add timestamp and version
        $data['_meta'] = [
            'timestamp' => microtime(true),
            'php_version' => PHP_VERSION,
            'transmitter_version' => '1.0',
        ];

        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);

        if ($json === false) {
            error_log("Profiler: JSON encode failed - " . json_last_error_msg());
            return false;
        }

        // Check size before attempting send
        if (strlen($json) > MAX_DATAGRAM_SIZE) {
            // Data too large, truncate or split
            return send_large_data($data, $socketPath);
        }

        return send_via_socket($json, $socketPath);
    } catch (\Throwable $e) {
        error_log("Profiler transmit error: " . $e->getMessage());
        return false;
    }
}

/**
 * Send JSON data via Unix domain socket with timeout
 *
 * @param string $json JSON-encoded data
 * @param string $socketPath Path to Unix socket
 * @return bool True if sent, false if failed
 */
function send_via_socket(string $json, string $socketPath): bool
{
    $socket = null;

    try {
        // Create Unix datagram socket (fire-and-forget, no connection needed)
        $socket = @socket_create(AF_UNIX, SOCK_DGRAM, 0);

        if ($socket === false) {
            error_log("Profiler: socket_create failed - " . socket_strerror(socket_last_error()));
            return write_to_disk_buffer($json);
        }

        // Set 50ms send timeout at socket level
        $result = @socket_set_option($socket, SOL_SOCKET, SO_SNDTIMEO, [
            'sec' => 0,
            'usec' => TRANSMIT_TIMEOUT_USEC
        ]);

        if ($result === false) {
            error_log("Profiler: socket_set_option failed");
            @socket_close($socket);
            return write_to_disk_buffer($json);
        }

        // Send data (fire-and-forget for SOCK_DGRAM)
        $startTime = microtime(true);
        $bytesSent = @socket_sendto($socket, $json, strlen($json), 0, $socketPath);
        $elapsed = (microtime(true) - $startTime) * 1000;

        @socket_close($socket);

        if ($bytesSent === false) {
            $error = socket_last_error();
            // Common errors: ECONNREFUSED (111), ENOENT (2)
            error_log("Profiler: socket_sendto failed - " . socket_strerror($error) . " (elapsed: {$elapsed}ms)");
            return write_to_disk_buffer($json);
        }

        // Log if close to timeout
        if ($elapsed > 40) {
            error_log("Profiler: Warning - socket_sendto took {$elapsed}ms");
        }

        return true;
    } catch (\Throwable $e) {
        error_log("Profiler socket error: " . $e->getMessage());
        if ($socket !== null) {
            @socket_close($socket);
        }
        return write_to_disk_buffer($json);
    }
}

/**
 * Write profiling data to disk buffer when socket unavailable
 *
 * Files are written atomically using tempnam + rename
 * Listener daemon will pick up these files when it recovers
 *
 * @param string $json JSON-encoded profiling data
 * @return bool True if written successfully
 */
function write_to_disk_buffer(string $json): bool
{
    try {
        $bufferDir = get_buffer_directory();

        if ($bufferDir === null) {
            return false;
        }

        // Create temp file in same directory (for atomic rename)
        $tempFile = @tempnam($bufferDir, 'profiling_');

        if ($tempFile === false) {
            error_log("Profiler: tempnam failed in $bufferDir");
            return false;
        }

        // Write data with exclusive lock
        $result = @file_put_contents($tempFile, $json, LOCK_EX);

        if ($result === false) {
            error_log("Profiler: file_put_contents failed to $tempFile");
            @unlink($tempFile);
            return false;
        }

        // Generate unique filename with timestamp
        $timestamp = date('Ymd_His');
        $unique = substr(md5(uniqid('', true)), 0, 8);
        $finalPath = $bufferDir . "/profile_{$timestamp}_{$unique}.json";

        // Atomic rename (same filesystem)
        if (!@rename($tempFile, $finalPath)) {
            error_log("Profiler: rename failed from $tempFile to $finalPath");
            @unlink($tempFile);
            return false;
        }

        return true;
    } catch (\Throwable $e) {
        error_log("Profiler disk buffer error: " . $e->getMessage());
        return false;
    }
}

/**
 * Get writable buffer directory
 *
 * @return string|null Directory path or null if unavailable
 */
function get_buffer_directory(): ?string
{
    $candidates = [
        '/var/lib/bitville-apm/buffer',
        '/tmp/bitville-apm-buffer',
        sys_get_temp_dir() . '/bitville-apm-buffer',
    ];

    foreach ($candidates as $dir) {
        // Check if exists or can be created
        if (@is_dir($dir) && @is_writable($dir)) {
            return $dir;
        }

        // Try to create
        if (@mkdir($dir, 0755, true)) {
            return $dir;
        }
    }

    // Fall back to system temp dir directly
    $tempDir = sys_get_temp_dir();
    if (@is_writable($tempDir)) {
        return $tempDir;
    }

    error_log("Profiler: No writable buffer directory found");
    return null;
}

/**
 * Clean up buffer files older than maxAge seconds
 *
 * Should be called occasionally (e.g., in listener.php startup)
 *
 * @param int $maxAge Maximum age in seconds (default 1 hour)
 */
function cleanup_old_buffers(int $maxAge = 3600): void
{
    try {
        $bufferDir = get_buffer_directory();
        if ($bufferDir === null) {
            return;
        }

        $files = @glob($bufferDir . '/profile_*.json');
        if ($files === false) {
            return;
        }

        $now = time();
        foreach ($files as $file) {
            $mtime = @filemtime($file);
            if ($mtime !== false && ($now - $mtime) > $maxAge) {
                @unlink($file);
            }
        }
    } catch (\Throwable $e) {
        error_log("Profiler cleanup error: " . $e->getMessage());
    }
}

/**
 * Handle large profiling data that exceeds datagram size
 *
 * Strategy: Truncate XHProf data (keep summary) and full SQL list
 * If still too large, write to disk buffer
 *
 * @param array $data Profiling data
 * @param string $socketPath Unix socket path
 * @return bool True if sent
 */
function send_large_data(array $data, string $socketPath): bool
{
    try {
        // First attempt: Truncate XHProf top_functions to top 50
        if (isset($data['xhprof']['profiling']['top_functions'])) {
            $data['xhprof']['profiling']['top_functions'] =
                array_slice($data['xhprof']['profiling']['top_functions'], 0, 50);
            $data['_meta']['truncated'] = true;
        }

        // Second attempt: Truncate SQL queries to top 100 slowest
        if (isset($data['sql']['queries']) && count($data['sql']['queries']) > 100) {
            // Sort by time descending
            usort($data['sql']['queries'], function($a, $b) {
                return ($b['time_ms'] ?? 0) <=> ($a['time_ms'] ?? 0);
            });
            $data['sql']['queries'] = array_slice($data['sql']['queries'], 0, 100);
            $data['_meta']['sql_truncated'] = true;
        }

        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);

        if (strlen($json) <= MAX_DATAGRAM_SIZE) {
            return send_via_socket($json, $socketPath);
        }

        // Still too large, go to disk buffer
        error_log("Profiler: Data still too large after truncation (" . strlen($json) . " bytes)");
        return write_to_disk_buffer($json);
    } catch (\Throwable $e) {
        error_log("Profiler large data error: " . $e->getMessage());
        return write_to_disk_buffer(json_encode($data));
    }
}

/**
 * Alias for send_profiling_data with clearer intent
 *
 * @param array $data Profiling data
 * @return bool True if transmitted via socket, false if buffered
 */
function transmit_or_buffer(array $data): bool
{
    return send_profiling_data($data);
}

/**
 * Check if listener socket exists and is accessible
 *
 * For diagnostic purposes - not called in normal flow
 *
 * @return array Status info
 */
function check_listener_socket(): array
{
    $config = get_profiling_config();
    $socketPath = $config['listener_socket_path'] ?? '/var/run/bitville-apm/listener.sock';

    $status = [
        'socket_path' => $socketPath,
        'exists' => file_exists($socketPath),
        'is_socket' => false,
        'writable_dir' => is_writable(dirname($socketPath)),
    ];

    if ($status['exists']) {
        $stat = @stat($socketPath);
        $status['is_socket'] = ($stat !== false && ($stat['mode'] & 0140000) === 0140000);
    }

    return $status;
}

// End of transmitter.php
