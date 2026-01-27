<?php
/**
 * ============================================================================
 * INTEGRATION GUIDE
 * ============================================================================
 *
 * 1. Include listener.php in your index.php:
 *
 *    // In /var/www/project/site/public/index.php:
 *    require_once dirname(__DIR__) . '/profiling/listener.php';
 *
 *    // ... autoloader and bootstrap ...
 *
 *    try {
 *        $application = new Application($di);
 *
 *        // Attach SQL collector after DI is ready
 *        if (function_exists('bitville_apm_attach_sql')) {
 *            bitville_apm_attach_sql($di);
 *        }
 *
 *        echo $application->handle($_SERVER['REQUEST_URI'])->getContent();
 *    } catch (\Exception $e) {
 *        // handle error
 *    }
 *
 * 2. Update project identifier:
 *    Edit the BITVILLE_APM_PROJECT constant in this file for each deployment.
 *
 * 3. Configure profiling:
 *    Edit /etc/bitville-apm/profiling.ini to adjust thresholds and features.
 *
 * 4. Optional - Add custom context:
 *    bitville_apm_add_context('user_id', $user->id);
 *    bitville_apm_add_context('route', $router->getMatchedRoute()->getName());
 *
 * ============================================================================
 */

/**
 * Bitville APM Profiler - Main Entry Point
 *
 * Include this file in your index.php BEFORE Application->run():
 *
 *   require_once __DIR__ . '/profiling/listener.php';
 *
 * The profiler will:
 * 1. Start timing and XHProf at include time
 * 2. Register shutdown function to collect data
 * 3. Only transmit data if request exceeds threshold (default 500ms)
 * 4. Never throw exceptions or break the application
 *
 * Configuration: /etc/bitville-apm/profiling.ini
 *
 * @version 1.0.0
 */

// ============================================================================
// SAFETY: Wrap entire profiler in try-catch
// ============================================================================

try {

// ============================================================================
// REQUIRE DEPENDENCIES
// ============================================================================

$profilerDir = __DIR__;
require_once $profilerDir . '/config.php';
require_once $profilerDir . '/correlation.php';
require_once $profilerDir . '/xhprof_collector.php';
require_once $profilerDir . '/sql_collector.php';
require_once $profilerDir . '/request_collector.php';
require_once $profilerDir . '/transmitter.php';

// ============================================================================
// HARD-CODED PROJECT IDENTIFIER
// Change this for each deployment
// ============================================================================

define('BITVILLE_APM_PROJECT', 'myproject');

// ============================================================================
// INITIALIZATION
// ============================================================================

// Generate unique correlation ID for this request
$GLOBALS['__bitville_apm_correlation_id'] = generate_correlation_id();

// Start request timer
init_request_timer();

// Start XHProf profiling (if enabled and extension loaded)
xhprof_start();

// SQL collector will be attached when DI is available (see attach function below)
$GLOBALS['__bitville_apm_sql_collector'] = null;

// ============================================================================
// SQL COLLECTOR ATTACHMENT FUNCTION
// ============================================================================

/**
 * Attach SQL collector to Phalcon DI container
 *
 * Call this AFTER Phalcon DI is initialized but BEFORE any database queries:
 *
 *   if (function_exists('bitville_apm_attach_sql')) {
 *       bitville_apm_attach_sql($di);
 *   }
 *
 * @param \Phalcon\Di\DiInterface $di Phalcon DI container
 */
function bitville_apm_attach_sql($di): void
{
    try {
        $correlationId = $GLOBALS['__bitville_apm_correlation_id'] ?? null;
        if ($correlationId === null) {
            return;
        }

        $collector = create_sql_collector($di, $correlationId);
        $GLOBALS['__bitville_apm_sql_collector'] = $collector;
    } catch (\Throwable $e) {
        error_log("Bitville APM: SQL collector attachment failed - " . $e->getMessage());
    }
}

// ============================================================================
// SHUTDOWN FUNCTION - CORE PROFILING LOGIC
// ============================================================================

register_shutdown_function(function() {
    // Reset execution time limit for shutdown operations
    // This prevents the profiler from being killed mid-execution
    @set_time_limit(0);

    try {
        // Check if profiling should be sent (request exceeded threshold)
        if (!should_profile()) {
            // Request was fast, discard profiling data
            xhprof_stop();  // Stop XHProf even if not sending
            return;
        }

        // ====================================================================
        // COLLECT ALL PROFILING DATA
        // ====================================================================

        $correlationId = $GLOBALS['__bitville_apm_correlation_id'] ?? 'unknown';
        $sqlCollector = $GLOBALS['__bitville_apm_sql_collector'];

        // Get XHProf data
        $xhprofData = xhprof_collect_all();

        // Get SQL data
        $sqlData = null;
        if ($sqlCollector !== null) {
            $sqlData = $sqlCollector->collectAll();
        }

        // Get request/response metadata
        $requestData = collect_all_request_data();

        // ====================================================================
        // BUILD PROFILING PAYLOAD
        // ====================================================================

        $config = get_profiling_config();

        $payload = [
            'correlation_id' => $correlationId,
            'project' => BITVILLE_APM_PROJECT,
            'timestamp' => microtime(true),
            'elapsed_ms' => RequestTimer::elapsed(),
            'threshold_ms' => $config['threshold_ms'] ?? 500,

            'request' => $requestData['request'] ?? [],
            'response' => $requestData['response'] ?? [],
            'timing' => $requestData['timing'] ?? [],

            'xhprof' => $xhprofData,
            'sql' => $sqlData,

            'server' => [
                'hostname' => gethostname() ?: 'unknown',
                'php_version' => PHP_VERSION,
                'sapi' => PHP_SAPI,
            ],
        ];

        // Include custom context if any
        if (!empty($GLOBALS['__bitville_apm_custom_context'])) {
            $payload['custom'] = $GLOBALS['__bitville_apm_custom_context'];
        }

        // ====================================================================
        // CHECK FOR FATAL ERRORS
        // ====================================================================

        $lastError = error_get_last();
        if ($lastError !== null) {
            $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
            if (in_array($lastError['type'], $fatalTypes)) {
                $payload['fatal_error'] = [
                    'type' => $lastError['type'],
                    'message' => $lastError['message'],
                    'file' => $lastError['file'],
                    'line' => $lastError['line'],
                ];
            }
        }

        // ====================================================================
        // TRANSMIT DATA
        // ====================================================================

        send_profiling_data($payload);

    } catch (\Throwable $e) {
        // Log but never fail
        error_log("Bitville APM shutdown error: " . $e->getMessage());
    }
});

// ============================================================================
// HELPER FUNCTIONS FOR APPLICATION USE
// ============================================================================

/**
 * Get the correlation ID for this request
 *
 * Use this to add correlation ID to outgoing HTTP requests, logs, etc.
 *
 * @return string|null Correlation ID or null if profiler not initialized
 */
function bitville_apm_correlation_id(): ?string
{
    return $GLOBALS['__bitville_apm_correlation_id'] ?? null;
}

/**
 * Get SQL comment for correlation ID injection
 *
 * Prepend this to SQL queries for database-side tracing:
 *   $sql = bitville_apm_sql_comment() . $sql;
 *
 * @return string SQL comment or empty string
 */
function bitville_apm_sql_comment(): string
{
    $correlationId = bitville_apm_correlation_id();
    if ($correlationId === null) {
        return '';
    }
    return format_sql_comment($correlationId);
}

/**
 * Add custom data to profiling payload
 *
 * Call this to add application-specific context:
 *   bitville_apm_add_context('user_id', 12345);
 *   bitville_apm_add_context('action', 'checkout');
 *
 * @param string $key Context key
 * @param mixed $value Context value (must be JSON-serializable)
 */
function bitville_apm_add_context(string $key, $value): void
{
    if (!isset($GLOBALS['__bitville_apm_custom_context'])) {
        $GLOBALS['__bitville_apm_custom_context'] = [];
    }
    $GLOBALS['__bitville_apm_custom_context'][$key] = $value;
}

/**
 * Check if profiler is active
 *
 * @return bool True if profiler initialized successfully
 */
function bitville_apm_is_active(): bool
{
    return isset($GLOBALS['__bitville_apm_correlation_id']);
}

// ============================================================================
// END OF SAFETY TRY-CATCH
// ============================================================================

} catch (\Throwable $e) {
    // Profiler initialization failed completely
    // Log and continue - application must not be affected
    error_log("Bitville APM initialization failed: " . $e->getMessage());
}
