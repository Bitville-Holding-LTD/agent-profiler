<?php
/**
 * Worker Lifecycle Management
 *
 * Monitors daemon health and triggers restart conditions:
 * - Memory limit exceeded
 * - Request count threshold reached
 * - Periodic garbage collection
 *
 * CRITICAL: All methods must be safe (no exceptions thrown)
 */

class WorkerLifecycle
{
    private int $requestCount = 0;
    private int $maxRequests;
    private int $memoryLimit; // in bytes
    private int $gcInterval;
    private int $lastGcRequestCount = 0;
    private int $gcRuns = 0;

    /**
     * @param int $maxRequests Maximum requests before restart (default: 1000)
     * @param int $memoryLimitMb Memory limit in MB before restart (default: 256)
     * @param int $gcInterval Run GC every N requests (default: 100)
     */
    public function __construct(
        int $maxRequests = 1000,
        int $memoryLimitMb = 256,
        int $gcInterval = 100
    ) {
        $this->maxRequests = $maxRequests;
        $this->memoryLimit = $memoryLimitMb * 1024 * 1024; // Convert MB to bytes
        $this->gcInterval = $gcInterval;
    }

    /**
     * Check if worker should restart due to resource limits
     *
     * @return bool True if restart is needed
     */
    public function shouldRestart(): bool
    {
        try {
            // Check request count threshold
            if ($this->requestCount >= $this->maxRequests) {
                error_log(sprintf(
                    "BitvilleAPM: Request threshold reached (%d/%d), restart required",
                    $this->requestCount,
                    $this->maxRequests
                ));
                return true;
            }

            // Check memory threshold
            $currentMemory = memory_get_usage(true);
            if ($currentMemory > $this->memoryLimit) {
                $currentMb = round($currentMemory / 1024 / 1024, 2);
                $limitMb = round($this->memoryLimit / 1024 / 1024, 2);
                error_log(sprintf(
                    "BitvilleAPM: Memory threshold exceeded (%.2fMB/%.2fMB), restart required",
                    $currentMb,
                    $limitMb
                ));
                return true;
            }

            return false;
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Error checking restart conditions: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Increment request counter and trigger GC if needed
     */
    public function incrementRequests(): void
    {
        try {
            $this->requestCount++;

            // Check if it's time for garbage collection
            if (($this->requestCount - $this->lastGcRequestCount) >= $this->gcInterval) {
                $this->runGarbageCollection();
            }
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Error incrementing requests: " . $e->getMessage());
        }
    }

    /**
     * Run garbage collection and log memory usage
     */
    public function runGarbageCollection(): void
    {
        try {
            $beforeMemory = memory_get_usage(true);
            $cycles = gc_collect_cycles();
            $afterMemory = memory_get_usage(true);

            $this->lastGcRequestCount = $this->requestCount;
            $this->gcRuns++;

            $beforeMb = round($beforeMemory / 1024 / 1024, 2);
            $afterMb = round($afterMemory / 1024 / 1024, 2);
            $freedMb = round(($beforeMemory - $afterMemory) / 1024 / 1024, 2);

            error_log(sprintf(
                "BitvilleAPM: GC completed, cycles: %d, memory: %.2fMB -> %.2fMB (freed: %.2fMB)",
                $cycles,
                $beforeMb,
                $afterMb,
                $freedMb
            ));
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Error running garbage collection: " . $e->getMessage());
        }
    }

    /**
     * Get current worker statistics
     *
     * @return array Statistics array
     */
    public function getStats(): array
    {
        try {
            $memoryBytes = memory_get_usage(true);
            $memoryMb = round($memoryBytes / 1024 / 1024, 2);
            $memoryLimitMb = round($this->memoryLimit / 1024 / 1024, 2);

            return [
                'request_count' => $this->requestCount,
                'memory_usage_mb' => $memoryMb,
                'memory_limit_mb' => $memoryLimitMb,
                'gc_runs' => $this->gcRuns,
                'max_requests' => $this->maxRequests,
            ];
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Error getting stats: " . $e->getMessage());
            return [
                'request_count' => $this->requestCount,
                'memory_usage_mb' => 0,
                'memory_limit_mb' => 0,
                'gc_runs' => $this->gcRuns,
                'max_requests' => $this->maxRequests,
            ];
        }
    }
}
