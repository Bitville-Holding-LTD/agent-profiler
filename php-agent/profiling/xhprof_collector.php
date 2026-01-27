<?php
/**
 * XHProf Collector - Function-level profiling wrapper
 *
 * Requires longxinH/xhprof extension installed
 * Uses XHPROF_FLAGS_NO_BUILTINS only for minimal overhead
 *
 * CRITICAL: Do NOT use XHPROF_FLAGS_CPU or XHPROF_FLAGS_MEMORY
 * Those flags add 200-300% overhead and reduce PHP 7 to PHP 5.6 performance levels
 */

require_once __DIR__ . '/config.php';

// Track whether XHProf was successfully started
// Static flag persists across function calls within same request
$GLOBALS['xhprof_started'] = false;

/**
 * Start XHProf profiling with minimal overhead flags
 *
 * Checks if XHProf extension is loaded and config enables profiling.
 * Uses XHPROF_FLAGS_NO_BUILTINS only (no CPU or memory flags).
 *
 * @return bool True if profiling started, false otherwise (never throws)
 */
function xhprof_start(): bool
{
    try {
        // Check if XHProf extension is loaded
        if (!extension_loaded('xhprof')) {
            return false;
        }

        // Check configuration toggle
        $config = get_profiling_config();
        if (empty($config['profiling_enabled'])) {
            return false;
        }

        // Start profiling with minimal overhead flags
        // CRITICAL: XHPROF_FLAGS_NO_BUILTINS only - no CPU or memory flags
        xhprof_enable(XHPROF_FLAGS_NO_BUILTINS);

        // Mark as started
        $GLOBALS['xhprof_started'] = true;

        return true;
    } catch (\Throwable $e) {
        error_log("Bitville APM: XHProf start failed - " . $e->getMessage());
        $GLOBALS['xhprof_started'] = false;
        return false;
    }
}

/**
 * Stop XHProf profiling and return raw data
 *
 * Returns null if profiling was not started or errors occur.
 *
 * @return array|null Raw XHProf data array or null
 */
function xhprof_stop(): ?array
{
    try {
        // Check if XHProf was started
        if (empty($GLOBALS['xhprof_started'])) {
            return null;
        }

        // Stop profiling and get raw data
        $rawData = xhprof_disable();

        // Reset started flag
        $GLOBALS['xhprof_started'] = false;

        return $rawData;
    } catch (\Throwable $e) {
        error_log("Bitville APM: XHProf stop failed - " . $e->getMessage());
        $GLOBALS['xhprof_started'] = false;
        return null;
    }
}

/**
 * Format raw XHProf data for transmission
 *
 * Extracts top N slowest functions with call count and wall time.
 * Sorts by wall time descending.
 *
 * @param array $rawData Raw XHProf output from xhprof_disable()
 * @param int $maxFunctions Maximum number of functions to include (default 100)
 * @return array Formatted array with function timing data
 */
function xhprof_format_data(array $rawData, int $maxFunctions = 100): array
{
    if (empty($rawData)) {
        return [];
    }

    $formatted = [];

    foreach ($rawData as $functionName => $metrics) {
        $formatted[] = [
            'name' => $functionName,
            'ct' => $metrics['ct'] ?? 0,      // Call count
            'wt' => $metrics['wt'] ?? 0,      // Wall time in microseconds
        ];
    }

    // Sort by wall time descending
    usort($formatted, function ($a, $b) {
        return $b['wt'] <=> $a['wt'];
    });

    // Take top N functions
    return array_slice($formatted, 0, $maxFunctions);
}

/**
 * Get memory statistics using PHP built-in functions
 *
 * Checks config toggle before capturing. Memory tracking is independent
 * of XHProf (not using XHPROF_FLAGS_MEMORY which adds overhead).
 *
 * @return array Memory statistics or empty array if disabled
 */
function get_memory_stats(): array
{
    try {
        $config = get_profiling_config();

        // Check if memory tracking is enabled (not in default config, assume true)
        if (isset($config['memory_tracking']) && !$config['memory_tracking']) {
            return [];
        }

        return [
            'peak_usage' => memory_get_peak_usage(true),          // Real memory allocated
            'current_usage' => memory_get_usage(true),            // Current real memory
            'peak_usage_no_real' => memory_get_peak_usage(false), // Emalloc only
        ];
    } catch (\Throwable $e) {
        error_log("Bitville APM: Memory stats failed - " . $e->getMessage());
        return [];
    }
}

/**
 * Summarize XHProf data with filtering and totals
 *
 * Filters out noise (functions < 1ms), sorts by wall time descending,
 * and returns top N functions with percentage calculations.
 *
 * @param array $rawData Raw XHProf output from xhprof_disable()
 * @param int $maxFunctions Maximum number of top functions to return (default 100)
 * @return array Summary with total_calls, total_wall_time, and top_functions
 */
function xhprof_summarize(array $rawData, int $maxFunctions = 100): array
{
    if (empty($rawData)) {
        return [
            'total_calls' => 0,
            'total_wall_time' => 0,
            'top_functions' => []
        ];
    }

    // Calculate totals and filter noise (< 1ms = 1000 microseconds)
    $totalCalls = 0;
    $totalWallTime = 0;
    $filtered = [];

    foreach ($rawData as $functionName => $metrics) {
        $wt = $metrics['wt'] ?? 0;
        $ct = $metrics['ct'] ?? 0;

        $totalCalls += $ct;
        $totalWallTime += $wt;

        // Filter out functions with < 1ms total time (noise)
        if ($wt >= 1000) {
            $filtered[] = [
                'name' => $functionName,
                'ct' => $ct,
                'wt' => $wt
            ];
        }
    }

    // Sort by wall time descending
    usort($filtered, function ($a, $b) {
        return $b['wt'] <=> $a['wt'];
    });

    // Take top N functions and calculate percentages
    $topFunctions = [];
    $topN = array_slice($filtered, 0, $maxFunctions);

    foreach ($topN as $func) {
        $topFunctions[] = [
            'name' => $func['name'],
            'calls' => $func['ct'],
            'wall_time_us' => $func['wt'],
            'wall_time_ms' => round($func['wt'] / 1000, 2),
            'pct_of_total' => $totalWallTime > 0
                ? round(($func['wt'] / $totalWallTime) * 100, 1)
                : 0.0
        ];
    }

    return [
        'total_calls' => $totalCalls,
        'total_wall_time' => $totalWallTime,
        'top_functions' => $topFunctions
    ];
}

/**
 * Get hotspots - functions consuming more than threshold% of total time
 *
 * These are the most impactful functions worth investigating for optimization.
 *
 * @param array $rawData Raw XHProf output from xhprof_disable()
 * @param float $threshold Minimum percentage of total time (default 5.0%)
 * @return array Array of hotspot functions with name, percentage, and wall time
 */
function xhprof_get_hotspots(array $rawData, float $threshold = 5.0): array
{
    if (empty($rawData)) {
        return [];
    }

    // Calculate total wall time
    $totalWallTime = 0;
    foreach ($rawData as $metrics) {
        $totalWallTime += $metrics['wt'] ?? 0;
    }

    if ($totalWallTime === 0) {
        return [];
    }

    // Find functions above threshold
    $hotspots = [];
    foreach ($rawData as $functionName => $metrics) {
        $wt = $metrics['wt'] ?? 0;
        $pct = ($wt / $totalWallTime) * 100;

        if ($pct >= $threshold) {
            $hotspots[] = [
                'name' => $functionName,
                'pct' => round($pct, 1),
                'wall_time_ms' => round($wt / 1000, 2)
            ];
        }
    }

    // Sort by percentage descending
    usort($hotspots, function ($a, $b) {
        return $b['pct'] <=> $a['pct'];
    });

    return $hotspots;
}

/**
 * Collect all profiling data - convenience function
 *
 * Stops XHProf, collects memory stats, summarizes profiling data,
 * and identifies hotspots. Returns complete profiling package.
 *
 * @return array|null Complete profiling data or null if XHProf not started
 */
function xhprof_collect_all(): ?array
{
    // Stop profiling
    $rawData = xhprof_stop();

    if ($rawData === null) {
        return null;
    }

    // Collect memory stats
    $memoryStats = get_memory_stats();

    // Summarize profiling data
    $summary = xhprof_summarize($rawData);

    // Get hotspots
    $hotspots = xhprof_get_hotspots($rawData);

    return [
        'profiling' => $summary,
        'hotspots' => $hotspots,
        'memory' => $memoryStats,
        'raw_count' => count($rawData)  // Total functions profiled
    ];
}
