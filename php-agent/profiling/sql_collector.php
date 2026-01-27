<?php
/**
 * SQL Collector - Captures all SQL queries via Phalcon events
 *
 * Integrates with Phalcon's Events Manager to capture beforeQuery/afterQuery
 * Adds correlation ID as SQL comment prefix for database-side tracing
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/correlation.php';

class SqlCollector
{
    private $correlationId;
    private $queries = [];
    private $currentQuery = null;
    private $enabled = true;
    private $maxQueries = 500;  // Prevent memory explosion on query-heavy pages
    private $captureStackTrace = true;
    private $stackTraceLimit = 5;

    public function __construct(string $correlationId)
    {
        $this->correlationId = $correlationId;

        $config = get_profiling_config();
        $method = $config['sql_capture_method'] ?? 'phalcon';

        // Disable if config says none
        if ($method === 'none') {
            $this->enabled = false;
        }

        // Get stack trace settings from config
        $this->captureStackTrace = $config['sql_stack_trace'] ?? true;
        $this->stackTraceLimit = $config['sql_stack_trace_limit'] ?? 5;
    }

    /**
     * Attach SQL collector to Phalcon database connection
     *
     * @param mixed $connection Phalcon database connection
     * @return bool True if attached successfully, false otherwise
     */
    public function attachToConnection($connection): bool
    {
        if (!$this->enabled) {
            return false;
        }

        try {
            $eventsManager = $connection->getEventsManager();
            if ($eventsManager === null) {
                $eventsManager = new \Phalcon\Events\Manager();
            }

            $collector = $this;

            $eventsManager->attach('db:beforeQuery', function($event, $connection) use ($collector) {
                $collector->onBeforeQuery($connection);
            });

            $eventsManager->attach('db:afterQuery', function($event, $connection) use ($collector) {
                $collector->onAfterQuery($connection);
            });

            $connection->setEventsManager($eventsManager);
            return true;
        } catch (\Throwable $e) {
            error_log("SqlCollector: Failed to attach - " . $e->getMessage());
            $this->enabled = false;
            return false;
        }
    }

    /**
     * Handle beforeQuery event - capture query start
     *
     * @param mixed $connection Phalcon database connection
     * @return void
     */
    public function onBeforeQuery($connection): void
    {
        if (!$this->enabled || count($this->queries) >= $this->maxQueries) {
            return;
        }

        try {
            $this->currentQuery = [
                'start_time' => microtime(true),
                'sql' => $connection->getSQLStatement(),
                'variables' => $connection->getSQLVariables(),
            ];

            if ($this->captureStackTrace) {
                $this->currentQuery['stack'] = debug_backtrace(
                    DEBUG_BACKTRACE_IGNORE_ARGS,
                    $this->stackTraceLimit
                );
            }
        } catch (\Throwable $e) {
            error_log("SqlCollector beforeQuery error: " . $e->getMessage());
        }
    }

    /**
     * Handle afterQuery event - calculate elapsed time and store
     *
     * @param mixed $connection Phalcon database connection
     * @return void
     */
    public function onAfterQuery($connection): void
    {
        if (!$this->enabled || $this->currentQuery === null) {
            return;
        }

        try {
            $endTime = microtime(true);
            $elapsed = ($endTime - $this->currentQuery['start_time']) * 1000;  // ms

            $this->queries[] = [
                'sql' => $this->redactSensitiveData($this->currentQuery['sql']),
                'time_ms' => round($elapsed, 3),
                'variables_count' => is_array($this->currentQuery['variables'])
                    ? count($this->currentQuery['variables'])
                    : 0,
                'stack' => $this->currentQuery['stack'] ?? [],
                'correlation_id' => $this->correlationId,
                'connection' => $this->getConnectionInfo($connection),
            ];
        } catch (\Throwable $e) {
            error_log("SqlCollector afterQuery error: " . $e->getMessage());
        }

        $this->currentQuery = null;
    }

    /**
     * Redact sensitive data patterns from SQL queries
     *
     * @param string $sql SQL query string
     * @return string Redacted SQL query
     */
    private function redactSensitiveData(string $sql): string
    {
        try {
            $patterns = [
                // Password fields
                "/password\s*=\s*'[^']*'/i" => "password='[REDACTED]'",
                '/password\s*=\s*"[^"]*"/i' => 'password="[REDACTED]"',

                // Token patterns
                "/token\s*=\s*'[^']*'/i" => "token='[REDACTED]'",
                '/token\s*=\s*"[^"]*"/i' => 'token="[REDACTED]"',
                "/api[_-]?key\s*=\s*'[^']*'/i" => "api_key='[REDACTED]'",

                // Secret patterns
                "/secret\s*=\s*'[^']*'/i" => "secret='[REDACTED]'",

                // Auth tokens in WHERE clauses
                "/auth[_-]?token\s*=\s*'[^']*'/i" => "auth_token='[REDACTED]'",

                // Credit card patterns (simple 16-digit)
                '/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/' => '[CARD-REDACTED]',
            ];

            foreach ($patterns as $pattern => $replacement) {
                $sql = preg_replace($pattern, $replacement, $sql);
            }

            return $sql;
        } catch (\Throwable $e) {
            // If redaction fails, return placeholder
            error_log("SqlCollector redaction error: " . $e->getMessage());
            return '[SQL REDACTION FAILED]';
        }
    }

    /**
     * Extract connection info from Phalcon connection
     *
     * @param mixed $connection Phalcon database connection
     * @return array Connection info (host, dbname, port)
     */
    private function getConnectionInfo($connection): array
    {
        try {
            $descriptor = $connection->getDescriptor();
            return [
                'host' => $descriptor['host'] ?? 'unknown',
                'dbname' => $descriptor['dbname'] ?? 'unknown',
                'port' => $descriptor['port'] ?? 5432,
            ];
        } catch (\Throwable $e) {
            return ['host' => 'unknown', 'dbname' => 'unknown', 'port' => 0];
        }
    }

    /**
     * Get SQL comment for correlation tagging
     *
     * @return string SQL comment with correlation ID
     */
    public function getCorrelationComment(): string
    {
        return format_sql_comment($this->correlationId);
    }

    /**
     * Get all collected queries
     *
     * @return array Array of query records
     */
    public function getQueries(): array
    {
        return $this->queries;
    }

    /**
     * Get summary statistics for collected queries
     *
     * @return array Summary stats (total queries, total time, slow queries)
     */
    public function getSummary(): array
    {
        $totalTime = 0;
        $slowQueries = [];
        $slowThreshold = 100;  // 100ms

        foreach ($this->queries as $query) {
            $totalTime += $query['time_ms'];
            if ($query['time_ms'] >= $slowThreshold) {
                $slowQueries[] = $query;
            }
        }

        return [
            'total_queries' => count($this->queries),
            'total_time_ms' => round($totalTime, 2),
            'slow_queries_count' => count($slowQueries),
            'queries_truncated' => count($this->queries) >= $this->maxQueries,
        ];
    }

    /**
     * Collect all SQL data for export
     *
     * @return array Complete SQL capture package
     */
    public function collectAll(): array
    {
        return [
            'summary' => $this->getSummary(),
            'queries' => $this->queries,
            'correlation_id' => $this->correlationId,
        ];
    }

    /**
     * Check if SQL capture is enabled
     *
     * @return bool True if enabled
     */
    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    /**
     * Get correlation ID
     *
     * @return string Correlation ID
     */
    public function getCorrelationId(): string
    {
        return $this->correlationId;
    }

    /**
     * Reset collector state (for testing)
     *
     * @return void
     */
    public function reset(): void
    {
        $this->queries = [];
        $this->currentQuery = null;
    }

    /**
     * Create and attach collector to a Phalcon DI container's db service
     *
     * @param \Phalcon\Di\DiInterface $di DI container
     * @param string $correlationId Correlation ID
     * @return SqlCollector|null Collector instance or null on failure
     */
    public static function createAndAttach($di, string $correlationId): ?self
    {
        try {
            $collector = new self($correlationId);

            // Check if db service exists
            if (!$di->has('db')) {
                error_log("SqlCollector: No 'db' service in DI container");
                return $collector;  // Return collector but not attached
            }

            $db = $di->getShared('db');
            $collector->attachToConnection($db);

            return $collector;
        } catch (\Throwable $e) {
            error_log("SqlCollector::createAndAttach failed: " . $e->getMessage());
            return null;
        }
    }
}

/**
 * Global function to create SQL collector - called from listener.php
 *
 * @param mixed $di Phalcon DI container
 * @param string $correlationId Correlation ID
 * @return SqlCollector|null Collector instance
 */
function create_sql_collector($di, string $correlationId): ?SqlCollector
{
    return SqlCollector::createAndAttach($di, $correlationId);
}
