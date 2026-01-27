<?php
declare(strict_types=1);

/**
 * Bitville APM Buffer Manager
 *
 * Manages memory buffering for profiling data with automatic disk overflow.
 *
 * Features:
 * - In-memory buffer with configurable size limit
 * - Automatic overflow to disk when memory buffer is full
 * - Atomic disk writes using tempnam + rename pattern
 * - FIFO disk buffer replay on daemon startup
 * - Safe error handling (never throws exceptions)
 */
class BufferManager
{
    private array $memoryBuffer = [];
    private int $memoryBufferLimit;
    private string $diskBufferPath;
    private int $diskFileCount = 0;

    /**
     * Constructor
     *
     * @param int $memoryBufferLimit Maximum items to hold in memory before overflow
     * @param string $diskBufferPath Directory path for disk overflow files
     */
    public function __construct(
        int $memoryBufferLimit = 100,
        string $diskBufferPath = '/var/lib/bitville-apm/buffer'
    ) {
        $this->memoryBufferLimit = $memoryBufferLimit;
        $this->diskBufferPath = rtrim($diskBufferPath, '/');

        // Ensure disk buffer directory exists
        if (!is_dir($this->diskBufferPath)) {
            @mkdir($this->diskBufferPath, 0755, true);
        }
    }

    /**
     * Add profiling data to memory buffer
     * Automatically overflows to disk when buffer is full
     *
     * @param array $data Profiling data to buffer
     */
    public function add(array $data): void
    {
        $this->memoryBuffer[] = $data;

        // Check if buffer is full and needs overflow
        if (count($this->memoryBuffer) >= $this->memoryBufferLimit) {
            error_log(sprintf(
                "BitvilleAPM: Memory buffer full (%d items), flushing to disk",
                count($this->memoryBuffer)
            ));
            $this->flushToDisk();
        }
    }

    /**
     * Flush memory buffer to disk using atomic write pattern
     * Clears memory buffer after successful write
     */
    public function flushToDisk(): void
    {
        if (empty($this->memoryBuffer)) {
            return;
        }

        $itemCount = count($this->memoryBuffer);

        // Create temporary file
        $tempFile = @tempnam($this->diskBufferPath, 'buffer_');
        if ($tempFile === false) {
            error_log("BitvilleAPM: BufferManager tempnam failed - disk buffer unavailable");
            return;
        }

        // Encode buffer to JSON
        $json = json_encode($this->memoryBuffer);
        if ($json === false) {
            @unlink($tempFile);
            error_log("BitvilleAPM: BufferManager JSON encode failed");
            return;
        }

        // Write to temporary file with exclusive lock
        if (@file_put_contents($tempFile, $json, LOCK_EX) === false) {
            @unlink($tempFile);
            error_log("BitvilleAPM: BufferManager write failed");
            return;
        }

        // Generate final filename with timestamp and unique ID
        $finalPath = sprintf(
            '%s/buffer_%s_%s.json',
            $this->diskBufferPath,
            microtime(true),
            substr(md5(uniqid('', true)), 0, 8)
        );

        // Atomic rename
        if (!@rename($tempFile, $finalPath)) {
            @unlink($tempFile);
            error_log("BitvilleAPM: BufferManager rename failed");
            return;
        }

        $this->diskFileCount++;
        error_log(sprintf(
            "BitvilleAPM: Buffer overflow - wrote %d items to disk (%s)",
            $itemCount,
            basename($finalPath)
        ));

        // Clear memory buffer after successful write
        $this->memoryBuffer = [];
    }

    /**
     * Get and clear current memory buffer contents
     * Used by circuit breaker (Plan 02-03) to get data for transmission
     *
     * @return array Current buffer contents
     */
    public function flush(): array
    {
        $data = $this->memoryBuffer;
        $this->memoryBuffer = [];
        return $data;
    }

    /**
     * Get current memory buffer item count
     *
     * @return int Number of items in memory buffer
     */
    public function count(): int
    {
        return count($this->memoryBuffer);
    }

    /**
     * Replay disk buffer files in FIFO order
     * Calls handler for each item, then deletes processed files
     *
     * @param callable $handler Callback to handle each buffered item
     * @return int Total number of items replayed
     */
    public function replayDiskBuffer(callable $handler): int
    {
        $pattern = $this->diskBufferPath . '/buffer_*.json';
        $files = glob($pattern);

        if ($files === false || empty($files)) {
            return 0;
        }

        // Sort by filename (timestamp-based) for FIFO order
        sort($files);

        $totalReplayed = 0;

        foreach ($files as $file) {
            try {
                // Read and decode JSON
                $json = @file_get_contents($file);
                if ($json === false) {
                    error_log("BitvilleAPM: Failed to read disk buffer file: " . basename($file));
                    continue;
                }

                $items = json_decode($json, true);
                if (!is_array($items)) {
                    error_log("BitvilleAPM: Invalid JSON in disk buffer file: " . basename($file));
                    @unlink($file); // Remove corrupt file
                    continue;
                }

                // Process each item
                foreach ($items as $item) {
                    $handler($item);
                    $totalReplayed++;
                }

                // Delete file after successful processing
                @unlink($file);

            } catch (\Throwable $e) {
                error_log("BitvilleAPM: Error replaying disk buffer file: " . $e->getMessage());
                continue;
            }
        }

        if ($totalReplayed > 0) {
            error_log(sprintf(
                "BitvilleAPM: Replayed %d items from %d disk buffer files",
                $totalReplayed,
                count($files)
            ));
        }

        return $totalReplayed;
    }

    /**
     * Get buffer statistics
     *
     * @return array Buffer stats including memory and disk counts
     */
    public function getStats(): array
    {
        return [
            'memory_buffer_count' => count($this->memoryBuffer),
            'memory_buffer_limit' => $this->memoryBufferLimit,
            'disk_overflow_count' => $this->diskFileCount,
            'disk_buffer_path' => $this->diskBufferPath,
        ];
    }

    /**
     * Get count of disk buffer files currently on disk
     *
     * @return int Number of buffer files on disk
     */
    public function getDiskBufferFileCount(): int
    {
        $pattern = $this->diskBufferPath . '/buffer_*.json';
        $files = glob($pattern);
        return ($files === false) ? 0 : count($files);
    }
}
