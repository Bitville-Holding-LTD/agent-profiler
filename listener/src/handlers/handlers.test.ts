import { test, expect, beforeAll, afterAll } from "bun:test";
import { handlePhpAgent } from "./php-agent.ts";
import { handlePostgresAgent } from "./postgres-agent.ts";
import { initDatabase, getDatabase } from "../database/connection.ts";
import { refreshApiKeys } from "../middleware/auth.ts";
import { unlink } from "node:fs/promises";

// Test database setup
const TEST_DB_PATH = "/tmp/test-handlers.db";

beforeAll(() => {
  // Set up test environment
  process.env.BITVILLE_DB_PATH = TEST_DB_PATH;
  process.env.BITVILLE_API_KEY_TESTPROJECT = "test-key-123";

  // Initialize database and refresh API keys
  initDatabase();
  refreshApiKeys();
});

afterAll(async () => {
  // Clean up test database
  const db = getDatabase();
  db?.close();

  try {
    await unlink(TEST_DB_PATH);
    await unlink(TEST_DB_PATH + "-shm");
    await unlink(TEST_DB_PATH + "-wal");
  } catch (err) {
    // Ignore cleanup errors
  }
});

// Sample valid PHP payload matching listener.php structure
const validPhpPayload = {
  correlation_id: "550e8400-e29b-41d4-a716-446655440000",
  project: "testproject",
  timestamp: Date.now() / 1000,
  elapsed_ms: 125.5,
  threshold_ms: 500,
  request: {
    method: "GET",
    uri: "/api/users/123",
    query_string: "format=json",
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept": "application/json",
    },
  },
  response: {
    status_code: 200,
    headers: {
      "content-type": "application/json",
    },
  },
  timing: {
    start_time: Date.now() / 1000 - 0.1255,
    end_time: Date.now() / 1000,
    duration_ms: 125.5,
  },
  xhprof: {
    "main()": {
      ct: 1,
      wt: 125000,
      cpu: 120000,
      mu: 1024,
      pmu: 2048,
    },
  },
  sql: {
    queries: [
      {
        query: "SELECT * FROM users WHERE id = ?",
        duration_ms: 5.2,
        stack_trace: ["App\\Controllers\\UserController::show"],
      },
    ],
    total_queries: 1,
    total_duration_ms: 5.2,
  },
  server: {
    hostname: "web01",
    php_version: "8.2.0",
    sapi: "fpm-fcgi",
  },
};

test("handlePhpAgent: valid request with authentication", async () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validPhpPayload),
  });

  const response = await handlePhpAgent(req);
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.row_id).toBeNumber();
  expect(body.correlation_id).toBe(validPhpPayload.correlation_id);
});

test("handlePhpAgent: missing authentication", async () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validPhpPayload),
  });

  const response = await handlePhpAgent(req);
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.error).toBe("Unauthorized");
});

test("handlePhpAgent: invalid API key", async () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer invalid-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validPhpPayload),
  });

  const response = await handlePhpAgent(req);
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.error).toBe("Unauthorized");
});

test("handlePhpAgent: invalid JSON", async () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-key-123",
      "Content-Type": "application/json",
    },
    body: "invalid json{",
  });

  const response = await handlePhpAgent(req);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toBe("Bad Request");
  expect(body.message).toBe("Invalid JSON payload");
});

test("handlePhpAgent: schema validation failure - missing required field", async () => {
  const invalidPayload = {
    // Missing correlation_id
    project: "testproject",
    timestamp: Date.now() / 1000,
  };

  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(invalidPayload),
  });

  const response = await handlePhpAgent(req);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toBe("Bad Request");
  expect(body.message).toBe("Payload validation failed");
  expect(body.details).toBeDefined();
});

test("handlePhpAgent: minimal valid payload", async () => {
  const minimalPayload = {
    correlation_id: "minimal-test-id",
    project: "testproject",
    timestamp: Date.now() / 1000,
    elapsed_ms: 10,
    request: {
      method: "GET",
      uri: "/",
    },
    server: {
      hostname: "web01",
      php_version: "8.2.0",
      sapi: "cli",
    },
  };

  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(minimalPayload),
  });

  const response = await handlePhpAgent(req);
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
});

// Postgres agent tests

const validPostgresPayload = {
  project: "testproject",
  timestamp: Date.now() / 1000,
  source: "pg_stat_activity" as const,
  data: {
    active_connections: 25,
    idle_connections: 10,
    queries: [
      {
        pid: 12345,
        query: "SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '1 day'",
        duration_ms: 150,
      },
    ],
  },
};

test("handlePostgresAgent: valid request with authentication", async () => {
  const req = new Request("http://localhost:8443/ingest/postgres", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validPostgresPayload),
  });

  const response = await handlePostgresAgent(req);
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.row_id).toBeNumber();
  expect(body.source).toBe("pg_stat_activity");
});

test("handlePostgresAgent: missing authentication", async () => {
  const req = new Request("http://localhost:8443/ingest/postgres", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validPostgresPayload),
  });

  const response = await handlePostgresAgent(req);
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body.error).toBe("Unauthorized");
});

test("handlePostgresAgent: invalid source type", async () => {
  const invalidPayload = {
    ...validPostgresPayload,
    source: "invalid_source",
  };

  const req = new Request("http://localhost:8443/ingest/postgres", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(invalidPayload),
  });

  const response = await handlePostgresAgent(req);
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toBe("Bad Request");
  expect(body.message).toBe("Payload validation failed");
});
