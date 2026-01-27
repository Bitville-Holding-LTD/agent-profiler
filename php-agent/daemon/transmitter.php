<?php
/**
 * Daemon Transmitter for Forwarding to Central Listener
 *
 * Sends profiling data from daemon to central listener via HTTP POST.
 * Integrates with circuit breaker to prevent wasted resources during failures.
 *
 * NOTE: Phase 3 will implement the actual central listener.
 * For now, uses configurable endpoint (defaults to localhost:8080/api/profiling).
 */

require_once __DIR__ . '/circuit_breaker.php';

class DaemonTransmitter
{
    private string $listenerUrl;
    private int $timeout;
    private CircuitBreaker $circuitBreaker;

    /**
     * @param string $listenerUrl Central listener endpoint URL
     * @param int $timeout Request timeout in seconds
     * @param CircuitBreaker|null $circuitBreaker Circuit breaker instance (creates default if null)
     */
    public function __construct(
        string $listenerUrl = 'http://localhost:8080/api/profiling',
        int $timeout = 5,
        ?CircuitBreaker $circuitBreaker = null
    ) {
        $this->listenerUrl = $listenerUrl;
        $this->timeout = $timeout;

        // Create default circuit breaker if not provided
        if ($circuitBreaker === null) {
            $circuitBreaker = new CircuitBreaker('central_listener');
        }

        $this->circuitBreaker = $circuitBreaker;
    }

    /**
     * Send profiling data to central listener
     *
     * @param array $data Profiling data to send
     * @return bool True on success, false on failure
     */
    public function send(array $data): bool
    {
        // Check circuit breaker first
        if (!$this->circuitBreaker->isAvailable()) {
            error_log("BitvilleAPM: Transmitter circuit open, skipping send");
            return false;
        }

        // Encode data as JSON
        $json = json_encode($data);

        // Use cURL for HTTP POST with timeout
        $ch = curl_init($this->listenerUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($json),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 2,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        // Note: curl_close() deprecated in PHP 8.0+ (no-op), but harmless for PHP 7.4

        // Check for success (HTTP 2xx)
        if ($httpCode >= 200 && $httpCode < 300) {
            $this->circuitBreaker->recordSuccess();
            return true;
        }

        // Record failure
        $this->circuitBreaker->recordFailure();
        error_log("BitvilleAPM: Transmitter failed - HTTP {$httpCode}, error: {$error}");
        return false;
    }

    /**
     * Send multiple items in batch
     *
     * Stops on circuit breaker open to avoid wasting resources.
     *
     * @param array $items Array of profiling data items
     * @return array ['success' => N, 'failed' => M]
     */
    public function sendBatch(array $items): array
    {
        $success = 0;
        $failed = 0;

        foreach ($items as $item) {
            // Stop if circuit opens during batch
            if (!$this->circuitBreaker->isAvailable()) {
                $failed += count($items) - ($success + $failed);
                break;
            }

            if ($this->send($item)) {
                $success++;
            } else {
                $failed++;
            }
        }

        return [
            'success' => $success,
            'failed' => $failed,
        ];
    }

    /**
     * Check if circuit breaker is open
     *
     * @return bool True if circuit open (rejecting requests)
     */
    public function isCircuitOpen(): bool
    {
        return !$this->circuitBreaker->isAvailable();
    }

    /**
     * Get transmitter statistics
     *
     * @return array Statistics including circuit breaker state
     */
    public function getStats(): array
    {
        return [
            'listener_url' => $this->listenerUrl,
            'timeout' => $this->timeout,
            'circuit_breaker' => $this->circuitBreaker->getStats(),
        ];
    }

    /**
     * Get circuit breaker instance for direct access
     *
     * @return CircuitBreaker
     */
    public function getCircuitBreaker(): CircuitBreaker
    {
        return $this->circuitBreaker;
    }
}
