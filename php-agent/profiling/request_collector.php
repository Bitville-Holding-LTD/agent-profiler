<?php
/**
 * Request Metadata Collector
 *
 * Captures request information: URL, method, headers, GET/POST variables
 * Filters sensitive data (passwords, tokens, etc.)
 */

require_once __DIR__ . '/config.php';

// Keys to always redact in request data
define('SENSITIVE_KEYS', [
    'password', 'passwd', 'pwd', 'pass',
    'token', 'auth_token', 'access_token', 'refresh_token',
    'api_key', 'apikey', 'secret', 'private_key',
    'credit_card', 'card_number', 'cvv', 'cvc',
    'ssn', 'social_security',
]);

// Headers to always redact
define('SENSITIVE_HEADERS', [
    'HTTP_AUTHORIZATION',
    'HTTP_X_API_KEY',
    'HTTP_X_AUTH_TOKEN',
    'HTTP_COOKIE',
]);

/**
 * Collect all request metadata
 *
 * @return array Request information
 */
function collect_request_metadata(): array
{
    $config = get_profiling_config();

    // Check if request metadata capture is enabled
    if (!($config['request_metadata_enabled'] ?? true)) {
        return [
            'url' => $_SERVER['REQUEST_URI'] ?? 'unknown',
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'unknown',
            '_metadata_disabled' => true,
        ];
    }

    try {
        return [
            'url' => get_request_url(),
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'unknown',
            'headers' => collect_headers(),
            'get' => filter_sensitive_data($_GET ?? []),
            'post' => filter_sensitive_data($_POST ?? []),
            'files' => filter_file_uploads(),
            'server' => collect_server_info(),
            'timestamp' => microtime(true),
        ];
    } catch (\Throwable $e) {
        error_log("Request collector error: " . $e->getMessage());
        return [
            'url' => $_SERVER['REQUEST_URI'] ?? 'unknown',
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'unknown',
            'error' => 'Collection failed',
        ];
    }
}

/**
 * Get full request URL
 *
 * @return string URL
 */
function get_request_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost';
    $uri = $_SERVER['REQUEST_URI'] ?? '/';

    // Redact query string values that look sensitive
    $urlParts = parse_url($uri);
    if (isset($urlParts['query'])) {
        parse_str($urlParts['query'], $queryParams);
        $queryParams = filter_sensitive_data($queryParams);
        $uri = $urlParts['path'] . '?' . http_build_query($queryParams);
    }

    return $scheme . '://' . $host . $uri;
}

/**
 * Collect HTTP headers with sensitive filtering
 *
 * @return array Headers
 */
function collect_headers(): array
{
    $headers = [];

    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') === 0) {
            // Convert HTTP_USER_AGENT to User-Agent format
            $headerName = str_replace('_', '-', substr($key, 5));
            $headerName = ucwords(strtolower($headerName), '-');

            // Check if sensitive
            if (in_array($key, SENSITIVE_HEADERS)) {
                $headers[$headerName] = '[REDACTED]';
            } else {
                $headers[$headerName] = $value;
            }
        }
    }

    // Limit header value length
    foreach ($headers as $key => $value) {
        if (strlen($value) > 500) {
            $headers[$key] = substr($value, 0, 500) . '...[truncated]';
        }
    }

    return $headers;
}

/**
 * Collect relevant server info
 *
 * @return array Server information
 */
function collect_server_info(): array
{
    return [
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
        'server_name' => $_SERVER['SERVER_NAME'] ?? 'unknown',
        'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'server_addr' => $_SERVER['SERVER_ADDR'] ?? 'unknown',
        'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? 'unknown',
        'script_filename' => $_SERVER['SCRIPT_FILENAME'] ?? 'unknown',
        'php_self' => $_SERVER['PHP_SELF'] ?? 'unknown',
    ];
}

/**
 * Filter sensitive data from arrays recursively
 *
 * @param mixed $data Data to filter
 * @param int $depth Current recursion depth
 * @return mixed Filtered data
 */
function filter_sensitive_data($data, int $depth = 0)
{
    // Prevent infinite recursion
    if ($depth > 5) {
        return '[MAX_DEPTH_EXCEEDED]';
    }

    if (!is_array($data)) {
        return $data;
    }

    $filtered = [];

    foreach ($data as $key => $value) {
        $lowercaseKey = strtolower((string)$key);

        // Check if key is sensitive
        $isSensitive = false;
        foreach (SENSITIVE_KEYS as $sensitiveKey) {
            if (strpos($lowercaseKey, $sensitiveKey) !== false) {
                $isSensitive = true;
                break;
            }
        }

        if ($isSensitive) {
            $filtered[$key] = '[REDACTED]';
        } elseif (is_array($value)) {
            $filtered[$key] = filter_sensitive_data($value, $depth + 1);
        } elseif (is_string($value) && strlen($value) > 1000) {
            // Truncate very long strings
            $filtered[$key] = substr($value, 0, 1000) . '...[truncated]';
        } else {
            $filtered[$key] = $value;
        }
    }

    return $filtered;
}

/**
 * Mask email address for privacy
 *
 * @param string $email Email address
 * @return string Masked email (j***@example.com)
 */
function mask_email(string $email): string
{
    $parts = explode('@', $email);
    if (count($parts) !== 2) {
        return '[INVALID_EMAIL]';
    }

    $local = $parts[0];
    $domain = $parts[1];

    if (strlen($local) <= 1) {
        $maskedLocal = '*';
    } else {
        $maskedLocal = $local[0] . str_repeat('*', min(3, strlen($local) - 1));
    }

    return $maskedLocal . '@' . $domain;
}

/**
 * Collect file upload info without actual file contents
 *
 * @return array File upload metadata
 */
function filter_file_uploads(): array
{
    if (empty($_FILES)) {
        return [];
    }

    $files = [];

    foreach ($_FILES as $key => $file) {
        if (is_array($file['name'])) {
            // Multiple files
            $files[$key] = [
                'count' => count($file['name']),
                'type' => 'multiple',
            ];
        } else {
            $files[$key] = [
                'name' => $file['name'],
                'type' => $file['type'],
                'size' => $file['size'],
                'error' => $file['error'],
                // Explicitly exclude tmp_name and file contents
            ];
        }
    }

    return $files;
}

/**
 * Request timer for tracking elapsed time
 */
class RequestTimer
{
    private static $startTime = null;

    /**
     * Start timing (call at request start)
     */
    public static function start(): void
    {
        self::$startTime = microtime(true);
    }

    /**
     * Get elapsed time in milliseconds
     *
     * @return float Elapsed ms
     */
    public static function elapsed(): float
    {
        if (self::$startTime === null) {
            // Fallback to REQUEST_TIME_FLOAT if available
            self::$startTime = $_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true);
        }

        return (microtime(true) - self::$startTime) * 1000;
    }

    /**
     * Check if elapsed time exceeds threshold
     *
     * @param float $thresholdMs Threshold in milliseconds
     * @return bool True if exceeded
     */
    public static function exceeds(float $thresholdMs): bool
    {
        return self::elapsed() >= $thresholdMs;
    }

    /**
     * Get timing data
     *
     * @return array Timing information
     */
    public static function getData(): array
    {
        return [
            'start_time' => self::$startTime,
            'elapsed_ms' => self::elapsed(),
            'request_time_float' => $_SERVER['REQUEST_TIME_FLOAT'] ?? null,
        ];
    }
}

/**
 * Collect response information (call at request end)
 *
 * @return array Response info
 */
function collect_response_info(): array
{
    return [
        'status_code' => http_response_code() ?: 200,
        'headers_sent' => headers_sent(),
        'output_buffering' => ob_get_level() > 0,
        'content_type' => null,  // Will be set from headers if available
    ];
}

/**
 * Collect complete request data package
 *
 * @return array All request metadata
 */
function collect_all_request_data(): array
{
    return [
        'request' => collect_request_metadata(),
        'response' => collect_response_info(),
        'timing' => RequestTimer::getData(),
    ];
}

/**
 * Initialize request timing
 * Call this at the very start of listener.php
 */
function init_request_timer(): void
{
    RequestTimer::start();
}

/**
 * Check if request exceeds profiling threshold
 *
 * @return bool True if should profile
 */
function should_profile(): bool
{
    $config = get_profiling_config();
    $threshold = $config['profiling_threshold_ms'] ?? 500;
    return RequestTimer::exceeds($threshold);
}
