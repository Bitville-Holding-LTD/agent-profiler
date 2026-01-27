<?php
/**
 * Circuit Breaker Pattern Implementation
 *
 * Tracks consecutive transmission failures and prevents wasted resources
 * by opening circuit after threshold exceeded. State persists across daemon restarts.
 *
 * States:
 * - CLOSED: Normal operation, requests allowed
 * - OPEN: Circuit broken, requests rejected (after threshold failures)
 * - HALF_OPEN: Testing recovery after timeout (allows one test request)
 */

class CircuitBreaker
{
    // Circuit states
    const STATE_CLOSED = 'closed';
    const STATE_OPEN = 'open';
    const STATE_HALF_OPEN = 'half_open';

    private string $name;
    private int $failureThreshold;
    private int $retryTimeout;
    private string $stateFilePath;

    // In-memory state (loaded from/saved to file)
    private string $state = self::STATE_CLOSED;
    private int $failureCount = 0;
    private float $lastFailureTime = 0;
    private float $openedAt = 0;

    /**
     * @param string $name Circuit breaker name (for state file)
     * @param int $failureThreshold Number of consecutive failures before opening
     * @param int $retryTimeout Seconds to wait before transitioning to half-open
     * @param string $stateDirectory Directory to store state files
     */
    public function __construct(
        string $name,
        int $failureThreshold = 5,
        int $retryTimeout = 60,
        string $stateDirectory = '/var/lib/bitville-apm/circuit-breaker-state'
    ) {
        $this->name = $name;
        $this->failureThreshold = $failureThreshold;
        $this->retryTimeout = $retryTimeout;

        // Ensure state directory exists
        @mkdir($stateDirectory, 0755, true);

        $this->stateFilePath = $stateDirectory . '/' . $name . '.state';

        // Load persisted state
        $this->loadState();
    }

    /**
     * Load circuit breaker state from disk
     */
    private function loadState(): void
    {
        if (!file_exists($this->stateFilePath)) {
            // Use defaults (closed, 0 failures)
            return;
        }

        $contents = @file_get_contents($this->stateFilePath);
        if ($contents === false) {
            return;
        }

        $data = json_decode($contents, true);
        if (!$data) {
            return;
        }

        // Restore state
        $this->state = $data['state'] ?? self::STATE_CLOSED;
        $this->failureCount = $data['failure_count'] ?? 0;
        $this->lastFailureTime = $data['last_failure_time'] ?? 0;
        $this->openedAt = $data['opened_at'] ?? 0;

        error_log("BitvilleAPM: CircuitBreaker {$this->name} restored state: {$this->state}");
    }

    /**
     * Save circuit breaker state to disk (atomic write)
     */
    private function saveState(): void
    {
        $data = json_encode([
            'state' => $this->state,
            'failure_count' => $this->failureCount,
            'last_failure_time' => $this->lastFailureTime,
            'opened_at' => $this->openedAt,
        ]);

        // Atomic write: temp file + rename
        $tempFile = @tempnam(dirname($this->stateFilePath), 'cb_');
        if ($tempFile && @file_put_contents($tempFile, $data) !== false) {
            @rename($tempFile, $this->stateFilePath);
        }
    }

    /**
     * Check if circuit breaker allows requests
     *
     * @return bool True if requests allowed, false if circuit open
     */
    public function isAvailable(): bool
    {
        if ($this->state === self::STATE_CLOSED) {
            return true;
        }

        if ($this->state === self::STATE_OPEN) {
            // Check if retry timeout elapsed
            $elapsedTime = microtime(true) - $this->openedAt;
            if ($elapsedTime > $this->retryTimeout) {
                // Transition to half-open state
                $this->state = self::STATE_HALF_OPEN;
                $this->saveState();
                error_log("BitvilleAPM: CircuitBreaker {$this->name} entering half-open state for testing");
                return true;
            }
            return false;
        }

        if ($this->state === self::STATE_HALF_OPEN) {
            // Allow one test request
            return true;
        }

        return false;
    }

    /**
     * Record successful transmission
     */
    public function recordSuccess(): void
    {
        if ($this->state === self::STATE_HALF_OPEN) {
            // Success in half-open state - close circuit
            $this->state = self::STATE_CLOSED;
            $this->failureCount = 0;
            $this->lastFailureTime = 0;
            $this->openedAt = 0;
            $this->saveState();
            error_log("BitvilleAPM: CircuitBreaker {$this->name} closed after successful test");
        } elseif ($this->state === self::STATE_CLOSED) {
            // Reset failure count on success
            $this->failureCount = 0;
        }
    }

    /**
     * Record transmission failure
     */
    public function recordFailure(): void
    {
        $this->failureCount++;
        $this->lastFailureTime = microtime(true);

        if ($this->state === self::STATE_HALF_OPEN) {
            // Failure in half-open state - reopen circuit
            $this->state = self::STATE_OPEN;
            $this->openedAt = microtime(true);
            $this->saveState();
            error_log("BitvilleAPM: CircuitBreaker {$this->name} reopened after half-open failure");
        } elseif ($this->state === self::STATE_CLOSED && $this->failureCount >= $this->failureThreshold) {
            // Threshold exceeded - open circuit
            $this->state = self::STATE_OPEN;
            $this->openedAt = microtime(true);
            $this->saveState();
            error_log("BitvilleAPM: CircuitBreaker {$this->name} opened after {$this->failureCount} failures");
        } else {
            // Persist failure count
            $this->saveState();
        }
    }

    /**
     * Get current circuit state
     *
     * @return string One of: 'closed', 'open', 'half_open'
     */
    public function getState(): string
    {
        return $this->state;
    }

    /**
     * Get circuit breaker statistics
     *
     * @return array Circuit breaker stats
     */
    public function getStats(): array
    {
        return [
            'name' => $this->name,
            'state' => $this->state,
            'failure_count' => $this->failureCount,
            'failure_threshold' => $this->failureThreshold,
            'retry_timeout' => $this->retryTimeout,
            'last_failure_time' => $this->lastFailureTime,
            'opened_at' => $this->openedAt,
        ];
    }

    /**
     * Manually reset circuit breaker to closed state
     *
     * For testing or manual intervention
     */
    public function reset(): void
    {
        $this->state = self::STATE_CLOSED;
        $this->failureCount = 0;
        $this->lastFailureTime = 0;
        $this->openedAt = 0;
        $this->saveState();
        error_log("BitvilleAPM: CircuitBreaker {$this->name} manually reset");
    }
}
