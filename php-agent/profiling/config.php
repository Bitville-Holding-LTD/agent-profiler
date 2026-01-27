<?php
/**
 * Configuration Loader - Bitville APM
 *
 * Loads profiling configuration with static caching for zero overhead
 * after first load. Safe defaults ensure profiling is disabled unless
 * explicitly enabled.
 */

// Define XHProf constant if not available
if (!defined('XHPROF_FLAGS_NO_BUILTINS')) {
    define('XHPROF_FLAGS_NO_BUILTINS', 0);
}

/**
 * Get profiling configuration with static caching
 *
 * First call reads from INI file (or uses defaults), subsequent calls
 * return cached array for zero overhead.
 *
 * @return array Configuration array with all profiling settings
 */
function get_profiling_config(): array
{
    static $config = null;

    // Return cached config if already loaded
    if ($config !== null) {
        return $config;
    }

    // Safe defaults - profiling disabled by default
    $defaults = [
        'profiling_enabled' => false,
        'profiling_threshold_ms' => 500,
        'xhprof_flags' => XHPROF_FLAGS_NO_BUILTINS,
        'sql_capture_enabled' => true,
        'sql_capture_method' => 'phalcon',  // 'phalcon', 'pdo', 'both', 'none'
        'sql_redact_sensitive' => true,
        'sql_stack_trace' => true,
        'sql_stack_trace_limit' => 5,
        'request_metadata_enabled' => true,
        'listener_socket_path' => '/var/run/bitville-apm/listener.sock',
        'listener_timeout_ms' => 50,
        'disk_buffer_path' => '/var/www/project/site/profiling/buffer',
        'disk_buffer_enabled' => true,
        'project_name' => 'default',
        'correlation_via_application_name' => true,
        'correlation_via_sql_comment' => true,
    ];

    $iniPath = '/etc/bitville-apm/profiling.ini';

    try {
        if (file_exists($iniPath) && is_readable($iniPath)) {
            $loaded = parse_ini_file($iniPath, false, INI_SCANNER_TYPED);
            if ($loaded === false) {
                error_log("Bitville APM: Failed to parse $iniPath, using defaults");
                $config = $defaults;
                return $config;
            }

            // Merge loaded config with defaults (loaded values override defaults)
            $config = array_merge($defaults, $loaded);
        } else {
            error_log("Bitville APM: Config file $iniPath not found, using defaults");
            $config = $defaults;
        }
    } catch (\Throwable $e) {
        error_log("Bitville APM: Config load error - " . $e->getMessage());
        $config = $defaults;
    }

    return $config;
}
