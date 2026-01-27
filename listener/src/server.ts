/**
 * Central Listener HTTP Server
 *
 * Main entry point for the Bitville APM & Centralized Logging system.
 * Receives profiling data from PHP agents and Postgres monitoring agents.
 *
 * Features:
 * - TLS/HTTPS support (optional for development)
 * - API key authentication
 * - JSON payload validation
 * - SQLite storage with WAL mode
 * - Health and readiness endpoints
 *
 * Environment variables:
 * - BITVILLE_PORT: Server port (default: 8443)
 * - BITVILLE_TLS_KEY_PATH: Path to TLS private key (optional)
 * - BITVILLE_TLS_CERT_PATH: Path to TLS certificate (optional)
 * - BITVILLE_DB_PATH: SQLite database path (default: /var/lib/bitville/listener.db)
 * - BITVILLE_API_KEY_*: API keys for projects (e.g., BITVILLE_API_KEY_MYPROJECT=key)
 */

import { initDatabase, getDatabase } from "./database/connection.ts";
import { handlePhpAgent } from "./handlers/php-agent.ts";
import { handlePostgresAgent } from "./handlers/postgres-agent.ts";
import { getApiKeyCount } from "./middleware/auth.ts";

// Initialize database on startup
console.log("[Listener] Initializing database...");
const db = initDatabase();
console.log("[Listener] Database initialized successfully");

// Configure server
const PORT = Number(Bun.env.BITVILLE_PORT) || 8443;
const TLS_KEY_PATH = Bun.env.BITVILLE_TLS_KEY_PATH;
const TLS_CERT_PATH = Bun.env.BITVILLE_TLS_CERT_PATH;

// Determine TLS configuration
const tlsConfig = TLS_KEY_PATH && TLS_CERT_PATH ? {
  key: Bun.file(TLS_KEY_PATH),
  cert: Bun.file(TLS_CERT_PATH),
} : undefined;

const protocol = tlsConfig ? "HTTPS" : "HTTP";

// Start server
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",

  // TLS configuration (optional)
  tls: tlsConfig,

  // Request handler
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Health check endpoint (static, fast)
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    // Readiness endpoint (dynamic, includes diagnostics)
    if (req.method === "GET" && url.pathname === "/ready") {
      const dbHealthy = getDatabase() !== null;
      const apiKeyCount = getApiKeyCount();

      return new Response(JSON.stringify({
        ready: dbHealthy && apiKeyCount > 0,
        uptime: process.uptime(),
        database: dbHealthy ? "connected" : "disconnected",
        api_keys: apiKeyCount,
      }), {
        status: dbHealthy && apiKeyCount > 0 ? 200 : 503,
        headers: { "content-type": "application/json" },
      });
    }

    // Ingestion endpoints (require POST)
    if (req.method === "POST") {
      if (url.pathname === "/ingest/php") {
        return handlePhpAgent(req);
      }

      if (url.pathname === "/ingest/postgres") {
        return handlePostgresAgent(req);
      }
    }

    // Unknown route
    return new Response(JSON.stringify({
      error: "Not Found",
      message: `Route ${req.method} ${url.pathname} not found`,
    }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  },

  // Error handler
  error(error: Error): Response {
    console.error("[Server Error]", error);
    return new Response(JSON.stringify({
      error: "Internal Server Error",
      message: error.message,
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  },
});

// Log startup message
console.log(`[Listener] ${protocol} server listening on port ${PORT}`);
console.log(`[Listener] Health check: ${protocol.toLowerCase()}://localhost:${PORT}/health`);
console.log(`[Listener] Readiness check: ${protocol.toLowerCase()}://localhost:${PORT}/ready`);
console.log(`[Listener] PHP agent endpoint: ${protocol.toLowerCase()}://localhost:${PORT}/ingest/php`);
console.log(`[Listener] Postgres agent endpoint: ${protocol.toLowerCase()}://localhost:${PORT}/ingest/postgres`);
console.log(`[Listener] Loaded ${getApiKeyCount()} API key(s)`);

// Graceful shutdown handler
process.on("SIGTERM", () => {
  console.log("[Listener] Received SIGTERM, shutting down gracefully...");

  // Stop accepting new connections (allow in-flight requests to complete)
  server.stop(false);

  // Close database connection
  const database = getDatabase();
  if (database) {
    database.close();
    console.log("[Listener] Database closed");
  }

  console.log("[Listener] Shutdown complete");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Listener] Received SIGINT, shutting down...");

  // Stop server immediately
  server.stop(true);

  // Close database
  const database = getDatabase();
  if (database) {
    database.close();
  }

  process.exit(0);
});

// Log unhandled errors (but don't crash)
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Listener] Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Listener] Uncaught Exception:", error);
  // In production, you might want to exit here
  // process.exit(1);
});
