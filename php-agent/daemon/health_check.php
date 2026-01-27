<?php
declare(strict_types=1);

/**
 * Health Check Server
 *
 * Provides HTTP endpoint for monitoring tools (Nagios, Prometheus, etc.)
 * Returns daemon status, uptime, and statistics as JSON
 *
 * Example response:
 * {
 *   "status": "ok",
 *   "timestamp": 1234567890.123,
 *   "uptime_seconds": 3600,
 *   "stats": {
 *     "worker": {...},
 *     "buffer": {...},
 *     "circuit_breaker": {...}
 *   }
 * }
 */

use React\EventLoop\Loop;
use React\Http\HttpServer;
use React\Http\Message\Response;
use React\Socket\SocketServer;
use Psr\Http\Message\ServerRequestInterface;

class HealthCheckServer
{
    private $socket;
    private int $port;
    private $statsCallback;
    private float $startTime;

    /**
     * Constructor
     *
     * @param int $port Port to listen on (default: 9191)
     * @param callable|null $statsCallback Callback that returns stats array
     */
    public function __construct(int $port = 9191, ?callable $statsCallback = null)
    {
        $this->port = $port;
        $this->statsCallback = $statsCallback;
        $this->startTime = microtime(true);
    }

    /**
     * Start the HTTP health check server
     */
    public function start(): void
    {
        $http = new HttpServer(function (ServerRequestInterface $request) {
            $path = $request->getUri()->getPath();

            if ($path === '/health' || $path === '/') {
                return $this->handleHealthCheck();
            }

            return new Response(
                404,
                ['Content-Type' => 'text/plain'],
                'Not found'
            );
        });

        $this->socket = new SocketServer('127.0.0.1:' . $this->port);
        $http->listen($this->socket);

        error_log("BitvilleAPM: Health check listening on http://127.0.0.1:{$this->port}/health");
    }

    /**
     * Handle /health endpoint request
     *
     * @return Response
     */
    private function handleHealthCheck(): Response
    {
        // Get stats from callback if provided
        $stats = $this->statsCallback ? ($this->statsCallback)() : [];

        // Calculate uptime
        $uptime = microtime(true) - $this->startTime;

        // Build response
        $body = json_encode([
            'status' => 'ok',
            'timestamp' => microtime(true),
            'uptime_seconds' => round($uptime, 2),
            'stats' => $stats,
        ], JSON_PRETTY_PRINT);

        return new Response(
            200,
            ['Content-Type' => 'application/json'],
            $body
        );
    }

    /**
     * Stop the health check server
     */
    public function stop(): void
    {
        if ($this->socket !== null) {
            $this->socket->close();
            error_log("BitvilleAPM: Health check server stopped");
        }
    }
}
