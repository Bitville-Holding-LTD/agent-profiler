<?php
/**
 * Unix Domain Socket Server
 *
 * Listens on Unix domain socket for profiling data from listener.php
 * Uses ReactPHP for async operation
 *
 * NOTE: ReactPHP requires SOCK_STREAM sockets. Phase 1 transmitter uses SOCK_DGRAM.
 * Plan 02-04 will update listener.php to use separate stream socket for daemon communication.
 *
 * CRITICAL: All operations must be safe (no thrown exceptions crash the daemon)
 */

use React\EventLoop\Loop;
use React\Socket\UnixServer;

class SocketServer
{
    private string $socketPath;
    private ?UnixServer $server = null;
    private $onDataCallback;
    private array $connectionBuffers = [];

    /**
     * @param string $socketPath Unix socket file path (default: /var/run/bitville-apm/daemon.sock)
     * @param callable $onDataCallback Called with parsed profiling data array
     */
    public function __construct(
        string $socketPath = '/var/run/bitville-apm/daemon.sock',
        ?callable $onDataCallback = null
    ) {
        $this->socketPath = $socketPath;
        $this->onDataCallback = $onDataCallback ?? function($data) {
            error_log("BitvilleAPM: Received data (no handler set): " . json_encode(array_keys($data)));
        };
    }

    /**
     * Start the socket server
     */
    public function start(): void
    {
        try {
            // Remove existing socket file if present
            if (file_exists($this->socketPath)) {
                if (!@unlink($this->socketPath)) {
                    error_log("BitvilleAPM: Warning - could not remove existing socket: {$this->socketPath}");
                }
            }

            // Create React UnixServer (stream socket)
            $this->server = new UnixServer($this->socketPath, [], Loop::get());

            // Set socket permissions for www-data access
            if (file_exists($this->socketPath)) {
                @chmod($this->socketPath, 0666);
            }

            // Register connection handler
            $this->server->on('connection', function ($connection) {
                $this->handleConnection($connection);
            });

            error_log("BitvilleAPM: Socket server listening on {$this->socketPath}");
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Failed to start socket server: " . $e->getMessage());
            $this->server = null;
        }
    }

    /**
     * Handle incoming connection
     *
     * @param \React\Socket\ConnectionInterface $connection
     */
    private function handleConnection($connection): void
    {
        try {
            $connectionId = spl_object_id($connection);
            $this->connectionBuffers[$connectionId] = '';

            // Handle incoming data
            $connection->on('data', function ($data) use ($connection, $connectionId) {
                $this->handleData($data, $connectionId);
            });

            // Handle connection close
            $connection->on('close', function () use ($connectionId) {
                unset($this->connectionBuffers[$connectionId]);
            });

            // Handle errors
            $connection->on('error', function (\Exception $e) use ($connectionId) {
                error_log("BitvilleAPM: Connection error: " . $e->getMessage());
                unset($this->connectionBuffers[$connectionId]);
            });
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Error handling connection: " . $e->getMessage());
        }
    }

    /**
     * Handle incoming data from connection
     *
     * Accumulates data until newline-delimited JSON is complete
     *
     * @param string $data Raw data chunk
     * @param int $connectionId Connection identifier
     */
    private function handleData(string $data, int $connectionId): void
    {
        try {
            // Append to buffer
            $this->connectionBuffers[$connectionId] .= $data;

            // Process complete messages (newline-delimited)
            while (($pos = strpos($this->connectionBuffers[$connectionId], "\n")) !== false) {
                $jsonLine = substr($this->connectionBuffers[$connectionId], 0, $pos);
                $this->connectionBuffers[$connectionId] = substr($this->connectionBuffers[$connectionId], $pos + 1);

                if (trim($jsonLine) === '') {
                    continue;
                }

                // Parse JSON
                $parsedData = @json_decode($jsonLine, true);

                if ($parsedData === null) {
                    error_log("BitvilleAPM: Failed to parse JSON: " . json_last_error_msg());
                    continue;
                }

                // Call callback with parsed data
                try {
                    call_user_func($this->onDataCallback, $parsedData);
                } catch (\Throwable $e) {
                    error_log("BitvilleAPM: Error in data callback: " . $e->getMessage());
                }
            }
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Error handling data: " . $e->getMessage());
        }
    }

    /**
     * Stop the socket server
     */
    public function stop(): void
    {
        try {
            if ($this->server !== null) {
                $this->server->close();
                $this->server = null;
            }

            // Remove socket file
            if (file_exists($this->socketPath)) {
                @unlink($this->socketPath);
            }

            // Clear connection buffers
            $this->connectionBuffers = [];

            error_log("BitvilleAPM: Socket server stopped");
        } catch (\Throwable $e) {
            error_log("BitvilleAPM: Error stopping socket server: " . $e->getMessage());
        }
    }

    /**
     * Get socket path
     *
     * @return string
     */
    public function getSocketPath(): string
    {
        return $this->socketPath;
    }
}
