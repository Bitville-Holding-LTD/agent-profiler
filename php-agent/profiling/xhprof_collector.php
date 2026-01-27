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
