# Phase 3: Central Listener Data Reception & Storage - Research

**Researched:** 2026-01-27
**Domain:** Bun HTTP/HTTPS server, SQLite with WAL mode, TypeScript data ingestion
**Confidence:** HIGH

## Summary

Phase 3 implements a central listener server using Bun runtime that receives profiling data from PHP agents and Postgres agents via HTTP POST and UDP protocols. The server authenticates requests using per-project API keys, stores data in SQLite with WAL mode, and implements 7-day retention with hourly cleanup.

The research confirms that Bun's native HTTP server (Bun.serve) with built-in TLS support is production-ready in 2026, providing high-performance request handling without framework overhead. Bun's native bun:sqlite module offers synchronous prepared statements with excellent performance, and WAL mode enables concurrent reads during writes. The architecture uses static routes for health checks and authentication middleware for Bearer token validation.

**Primary recommendation:** Use Bun.serve with native TLS, bun:sqlite with WAL mode and prepared statements, environment variables for API key storage, and in-process cron scheduling (croner library) for hourly cleanup. Avoid frameworks like Express or Hono - Bun's native APIs are sufficient and faster.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun | 1.3+ | Runtime & HTTP server | Native TypeScript, built-in HTTP/HTTPS/UDP, high performance (2.5x faster than Node), production-ready 2026 |
| bun:sqlite | Built-in | SQLite database driver | Native to Bun, 3-6x faster than better-sqlite3, synchronous API, prepared statements |
| TypeScript | 5.x | Type safety | Native Bun support, no transpilation overhead |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| croner | 8.x+ | Cron job scheduling | In-process cleanup scheduling, zero dependencies, TypeScript support |
| zod | 3.x | JSON validation | Runtime validation for incoming payloads, type inference |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun.serve | Express/Fastify/Hono | Frameworks add 10-20% overhead, unnecessary complexity for simple API |
| bun:sqlite | better-sqlite3 | better-sqlite3 requires compilation, performance gap narrows with database I/O |
| croner | System cron | System cron requires external configuration, less portable, no TypeScript integration |
| Environment variables | Configuration file | Env vars are systemd-native, easier secret management |

**Installation:**
```bash
# No installation needed - Bun and bun:sqlite are built-in
bun add croner zod
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── server.ts           # Main entry point, Bun.serve configuration
├── handlers/           # Request handlers
│   ├── php-agent.ts    # PHP profiling data endpoint
│   ├── postgres-agent.ts # Postgres monitoring data endpoint
│   └── health.ts       # Health check endpoints
├── middleware/         # Request middleware
│   ├── auth.ts         # API key validation
│   └── error.ts        # Error handling
├── database/           # Database layer
│   ├── schema.sql      # Schema definition
│   ├── connection.ts   # Database initialization
│   ├── queries.ts      # Prepared statements
│   └── cleanup.ts      # Retention policy
├── types/              # TypeScript types
│   ├── payloads.ts     # Request payload types
│   └── env.ts          # Environment variable types
└── utils/              # Utilities
    ├── validation.ts   # JSON schema validation
    └── logger.ts       # Logging
```

### Pattern 1: Bun.serve with Static Routes and TLS
**What:** Use Bun's native routes object for static responses, fetch handler for dynamic logic
**When to use:** All Bun HTTP servers with TLS
**Example:**
```typescript
// Source: https://bun.sh/docs/api/http
import { Database } from "bun:sqlite";

const server = Bun.serve({
  port: 8443,
  hostname: "0.0.0.0",

  // TLS configuration
  tls: {
    key: Bun.file("/etc/bitville/listener-key.pem"),
    cert: Bun.file("/etc/bitville/listener-cert.pem"),
  },

  // Static routes for health checks (15% faster than dynamic responses)
  routes: {
    "/health": new Response("OK", {
      headers: { "content-type": "text/plain" }
    }),
    "/ready": new Response(JSON.stringify({ ready: true }), {
      headers: { "content-type": "application/json" }
    }),
  },

  // Dynamic request handler
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle POST endpoints
    if (req.method === "POST") {
      if (url.pathname === "/ingest/php") {
        return handlePhpAgent(req, server);
      }
      if (url.pathname === "/ingest/postgres") {
        return handlePostgresAgent(req, server);
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // Global error handler
  error(error) {
    console.error("Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

console.log(`Listener running at ${server.url}`);
```

### Pattern 2: API Key Authentication Middleware
**What:** Extract and validate Bearer tokens from Authorization header
**When to use:** All authenticated endpoints
**Example:**
```typescript
// Source: https://medium.com/@mendes.develop/authentication-and-authorization-made-easy-with-hot-js-runtime-1fa42e8f7905
// Adapted for native Bun.serve

interface AuthContext {
  projectKey: string;
  isValid: boolean;
}

function authenticateRequest(req: Request): AuthContext {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { projectKey: "", isValid: false };
  }

  const apiKey = authHeader.substring(7); // Remove "Bearer "

  // Validate against environment variables
  // BITVILLE_API_KEY_PROJECT1=key-abc123
  // BITVILLE_API_KEY_PROJECT2=key-def456
  for (const [envKey, envValue] of Object.entries(Bun.env)) {
    if (envKey.startsWith("BITVILLE_API_KEY_") && envValue === apiKey) {
      const projectKey = envKey.replace("BITVILLE_API_KEY_", "").toLowerCase();
      return { projectKey, isValid: true };
    }
  }

  return { projectKey: "", isValid: false };
}

async function handlePhpAgent(req: Request, server: Server): Promise<Response> {
  const auth = authenticateRequest(req);

  if (!auth.isValid) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" }
    });
  }

  // Process request with validated projectKey
  const payload = await req.json();
  // ... store in database

  return new Response("OK", { status: 200 });
}
```

### Pattern 3: SQLite with WAL Mode and Prepared Statements
**What:** Initialize SQLite with WAL mode, use prepared statements for all queries
**When to use:** All database operations
**Example:**
```typescript
// Source: https://bun.sh/docs/api/sqlite
import { Database } from "bun:sqlite";

// Initialize database with WAL mode
const db = new Database("/var/lib/bitville/listener.db", { create: true });

// Enable WAL mode (must be first pragma)
db.run("PRAGMA journal_mode = WAL;");

// Performance optimizations
db.run("PRAGMA synchronous = NORMAL;");  // Safe with WAL
db.run("PRAGMA cache_size = -50000;");   // 200MB cache
db.run("PRAGMA temp_store = MEMORY;");

// Create schema
db.run(`
  CREATE TABLE IF NOT EXISTS profiling_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correlation_id TEXT NOT NULL,
    project TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    duration_ms REAL,
    payload TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

// Create indexes
db.run("CREATE INDEX IF NOT EXISTS idx_correlation_id ON profiling_data(correlation_id);");
db.run("CREATE INDEX IF NOT EXISTS idx_project_timestamp ON profiling_data(project, timestamp);");
db.run("CREATE INDEX IF NOT EXISTS idx_duration ON profiling_data(duration_ms) WHERE duration_ms IS NOT NULL;");
db.run("CREATE INDEX IF NOT EXISTS idx_source_timestamp ON profiling_data(source, timestamp);");

// Prepared statements (cached by Bun)
const insertStatement = db.query(`
  INSERT INTO profiling_data (correlation_id, project, source, timestamp, duration_ms, payload)
  VALUES ($correlation_id, $project, $source, $timestamp, $duration_ms, $payload)
`);

// Using prepared statement
function storeProfilingData(data: ProfilingPayload) {
  const result = insertStatement.run({
    $correlation_id: data.correlationId,
    $project: data.project,
    $source: data.source,
    $timestamp: Math.floor(Date.now() / 1000),
    $duration_ms: data.durationMs,
    $payload: JSON.stringify(data.payload),
  });

  return result.lastInsertRowid;
}

// Transactions for batch operations
const insertMany = db.transaction((records: ProfilingPayload[]) => {
  for (const record of records) {
    insertStatement.run({
      $correlation_id: record.correlationId,
      $project: record.project,
      $source: record.source,
      $timestamp: Math.floor(Date.now() / 1000),
      $duration_ms: record.durationMs,
      $payload: JSON.stringify(record.payload),
    });
  }
});
```

### Pattern 4: HTTP and UDP in Same Process
**What:** Run Bun.serve for HTTP and Bun.udpSocket for UDP simultaneously
**When to use:** When both protocols are required
**Example:**
```typescript
// Source: https://bun.sh/docs/api/udp
// HTTP Server
const httpServer = Bun.serve({
  port: 8443,
  tls: { /* ... */ },
  fetch(req) {
    return new Response("HTTP listener");
  },
});

// UDP Socket (optional, for future optimization)
const udpSocket = await Bun.udpSocket({
  port: 8444,
  socket: {
    data(socket, buf, port, addr) {
      console.log(`UDP message from ${addr}:${port}`);
      // Parse and store profiling data
      const payload = JSON.parse(buf.toString());
      storeProfilingData(payload);
    },
  },
});

console.log(`HTTP server on port ${httpServer.port}`);
console.log(`UDP socket on port ${udpSocket.port}`);
```

### Pattern 5: In-Process Cron Scheduling
**What:** Use croner library for hourly cleanup within the Bun process
**When to use:** Scheduled tasks that need TypeScript integration
**Example:**
```typescript
// Source: https://github.com/Hexagon/croner
import { Cron } from "croner";
import { Database } from "bun:sqlite";

const db = new Database("/var/lib/bitville/listener.db");
const deleteOldData = db.query(`
  DELETE FROM profiling_data
  WHERE timestamp < strftime('%s', 'now') - (7 * 24 * 60 * 60)
`);

// Run hourly cleanup
const cleanupJob = Cron("0 * * * *", () => {
  console.log("Running cleanup job...");
  const result = deleteOldData.run();
  console.log(`Deleted ${result.changes} old records`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  cleanupJob.stop();
  db.close();
  process.exit(0);
});
```

### Pattern 6: JSON Validation with Zod
**What:** Validate incoming JSON payloads with runtime type checking
**When to use:** All request body parsing
**Example:**
```typescript
// Source: https://medium.com/@mendes.develop/authentication-and-authorization-made-easy-with-hot-js-runtime-1fa42e8f7905
import { z } from "zod";

const PhpPayloadSchema = z.object({
  project: z.string(),
  correlation_id: z.string(),
  timestamp: z.number(),
  duration_ms: z.number().nullable(),
  request_uri: z.string(),
  profiling_data: z.record(z.unknown()),
});

type PhpPayload = z.infer<typeof PhpPayloadSchema>;

async function handlePhpAgent(req: Request): Promise<Response> {
  try {
    const rawPayload = await req.json();
    const payload = PhpPayloadSchema.parse(rawPayload);

    // Payload is now type-safe
    storeProfilingData(payload);

    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid payload", details: error.errors }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    throw error;
  }
}
```

### Anti-Patterns to Avoid
- **Using frameworks (Express, Fastify, Hono):** Adds 10-20% overhead, unnecessary for simple API with authentication
- **Synchronous blocking operations in fetch handler:** Use async/await for database writes to avoid blocking event loop
- **Multiple small socket.write() calls:** Buffer writes using ArrayBufferSink instead of individual writes
- **Ignoring backpressure:** Monitor server.pendingRequests and implement graceful degradation

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron expression parsing | Custom interval scheduler | croner library | Handles edge cases (leap years, DST), battle-tested |
| JSON schema validation | Manual field checking | Zod | Type inference, detailed errors, composable schemas |
| Bearer token parsing | String manipulation | Authorization header pattern | Standard format, handles edge cases |
| SQLite connection pooling | Custom pool manager | No pooling needed | SQLite is embedded, single connection suffices |
| TLS certificate loading | Manual file reading | Bun.file() | Handles async loading, memory efficient |
| Environment variable typing | Manual type assertions | TypeScript interface merging | Autocomplete, compile-time safety |

**Key insight:** Bun's built-in APIs (Bun.serve, bun:sqlite, Bun.file) are optimized for the runtime and outperform third-party alternatives. Avoid adding dependencies unless they provide significant value.

## Common Pitfalls

### Pitfall 1: Not Enabling WAL Mode Immediately
**What goes wrong:** SQLite defaults to DELETE journal mode, which causes write contention and "database is locked" errors under concurrent access.
**Why it happens:** WAL mode must be explicitly enabled with a PRAGMA statement.
**How to avoid:** Run `PRAGMA journal_mode = WAL;` immediately after opening the database connection, before any other operations.
**Warning signs:** "SQLITE_BUSY" errors, slow writes, blocked reads during writes.

### Pitfall 2: Large Transactions in WAL Mode
**What goes wrong:** Transactions larger than ~100MB cause performance degradation in WAL mode.
**Why it happens:** WAL mode is optimized for smaller transactions; large transactions prevent checkpointing and cause WAL file growth.
**How to avoid:** For bulk inserts, batch records into transactions of 1000-5000 rows. Run `PRAGMA wal_checkpoint(TRUNCATE)` after large operations.
**Warning signs:** Unbounded WAL file growth (*.db-wal file size increases indefinitely), slowing writes over time.

### Pitfall 3: Forgetting to Set synchronous=NORMAL with WAL
**What goes wrong:** Default synchronous=FULL setting causes unnecessary fsync calls, reducing write throughput.
**Why it happens:** SQLite defaults to maximum durability, but WAL mode is corruption-safe with synchronous=NORMAL.
**How to avoid:** Run `PRAGMA synchronous = NORMAL;` after enabling WAL mode.
**Warning signs:** Write latency higher than expected (>5ms per insert), high system CPU wait time.

### Pitfall 4: Not Validating API Keys Against Environment Variables Efficiently
**What goes wrong:** Loading environment variables on every request or iterating all env vars causes performance overhead.
**Why it happens:** Environment variable access can be slow if done repeatedly.
**How to avoid:** Load API keys into a Map<string, string> at startup, validate against the map.
**Warning signs:** High CPU usage in authentication middleware, authentication taking >1ms per request.

### Pitfall 5: Using Self-Signed Certificates Without Client Configuration
**What goes wrong:** PHP agents using cURL or Guzzle will reject self-signed certificates by default.
**Why it happens:** TLS clients verify certificates against trusted CAs; self-signed certificates are not in the trust store.
**How to avoid:** Either (1) use Let's Encrypt for free CA-signed certificates, or (2) configure PHP agents to accept the specific self-signed certificate or disable verification (CURLOPT_SSL_VERIFYPEER=false) for internal networks only.
**Warning signs:** PHP agents failing to connect with "SSL certificate problem: self signed certificate" errors.

### Pitfall 6: Not Handling JSON Parsing Errors
**What goes wrong:** Malformed JSON from agents crashes the server or returns generic 500 errors.
**Why it happens:** await req.json() throws on invalid JSON, and without try/catch it becomes an unhandled error.
**How to avoid:** Wrap req.json() in try/catch, return 400 Bad Request with error details. Use Zod for validation with detailed error messages.
**Warning signs:** Server crashes on malformed payloads, generic "Internal Server Error" responses.

### Pitfall 7: Not Buffering UDP Writes
**What goes wrong:** Calling socket.write() repeatedly for small data causes system call overhead.
**Why it happens:** Each write() is a separate system call; bundling reduces overhead.
**How to avoid:** Use ArrayBufferSink with {stream: true} to buffer writes, or use socket.sendMany() for batch sends.
**Warning signs:** High system CPU usage, low throughput despite low network utilization.

### Pitfall 8: Running DELETE Without VACUUM
**What goes wrong:** Database file size never decreases after deleting old records.
**Why it happens:** SQLite marks space as free but doesn't reclaim it from the filesystem.
**How to avoid:** For bounded database size, run `PRAGMA auto_vacuum = INCREMENTAL;` at schema creation, then periodically run `PRAGMA incremental_vacuum;`. Alternatively, run `VACUUM;` monthly (causes brief write lock).
**Warning signs:** Database file grows unbounded, disk usage increases despite 7-day retention.

## Code Examples

Verified patterns from official sources:

### Complete Server Initialization
```typescript
// Source: https://bun.sh/docs/api/http + https://bun.sh/docs/api/sqlite
import { Database } from "bun:sqlite";
import { Cron } from "croner";

// Load and validate environment variables
const requiredEnvVars = ["BITVILLE_API_KEY_PROJECT1"];
for (const varName of requiredEnvVars) {
  if (!Bun.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

// Initialize database
const db = new Database("/var/lib/bitville/listener.db", { create: true });
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");
db.run("PRAGMA cache_size = -50000;");
db.run("PRAGMA temp_store = MEMORY;");
db.run("PRAGMA auto_vacuum = INCREMENTAL;");

// Schema and indexes
db.exec(`
  CREATE TABLE IF NOT EXISTS profiling_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correlation_id TEXT NOT NULL,
    project TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    duration_ms REAL,
    payload TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_correlation_id ON profiling_data(correlation_id);
  CREATE INDEX IF NOT EXISTS idx_project_timestamp ON profiling_data(project, timestamp);
  CREATE INDEX IF NOT EXISTS idx_duration ON profiling_data(duration_ms) WHERE duration_ms IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_source_timestamp ON profiling_data(source, timestamp);
`);

// Prepared statements
const insertData = db.query(`
  INSERT INTO profiling_data (correlation_id, project, source, timestamp, duration_ms, payload)
  VALUES ($correlation_id, $project, $source, $timestamp, $duration_ms, $payload)
`);

const deleteOldData = db.query(`
  DELETE FROM profiling_data
  WHERE timestamp < strftime('%s', 'now') - (7 * 24 * 60 * 60)
`);

// Cleanup job (hourly)
const cleanupJob = Cron("0 * * * *", () => {
  const result = deleteOldData.run();
  console.log(`[Cleanup] Deleted ${result.changes} records older than 7 days`);

  // Incremental vacuum to reclaim space
  db.run("PRAGMA incremental_vacuum(100);");
});

// HTTP Server
const server = Bun.serve({
  port: 8443,
  hostname: "0.0.0.0",

  tls: {
    key: Bun.file("/etc/bitville/listener-key.pem"),
    cert: Bun.file("/etc/bitville/listener-cert.pem"),
  },

  routes: {
    "/health": new Response("OK"),
    "/ready": new Response(JSON.stringify({ ready: true, uptime: process.uptime() }), {
      headers: { "content-type": "application/json" }
    }),
  },

  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/ingest/php") {
      return handlePhpAgent(req);
    }

    if (req.method === "POST" && url.pathname === "/ingest/postgres") {
      return handlePostgresAgent(req);
    }

    return new Response("Not Found", { status: 404 });
  },

  error(error) {
    console.error("[Server Error]", error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

console.log(`[Listener] Running at ${server.url}`);
console.log(`[Listener] Health check: ${server.url}health`);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Listener] Shutting down gracefully...");
  cleanupJob.stop();
  server.stop(false); // Allow in-flight requests to complete
  db.close();
  process.exit(0);
});
```

### Environment Variable Type Safety
```typescript
// Source: https://bun.sh/docs/runtime/environment-variables
// types/env.d.ts
declare module "bun" {
  interface Env {
    BITVILLE_API_KEY_PROJECT1: string;
    BITVILLE_API_KEY_PROJECT2: string;
    BITVILLE_DB_PATH: string;
    BITVILLE_TLS_KEY_PATH: string;
    BITVILLE_TLS_CERT_PATH: string;
  }
}

// Now Bun.env.BITVILLE_API_KEY_PROJECT1 is typed and autocompletes
```

### Request Handler with Validation
```typescript
// Source: Composite of Bun docs + Zod patterns
import { z } from "zod";

const PhpPayloadSchema = z.object({
  project: z.string().min(1).max(50),
  correlation_id: z.string().uuid(),
  timestamp: z.number().int().positive(),
  duration_ms: z.number().nullable(),
  request_uri: z.string(),
  profiling_data: z.record(z.unknown()),
});

function authenticateRequest(req: Request): { projectKey: string; isValid: boolean } {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { projectKey: "", isValid: false };
  }

  const apiKey = authHeader.substring(7);

  // Check against environment variables
  for (const [envKey, envValue] of Object.entries(Bun.env)) {
    if (envKey.startsWith("BITVILLE_API_KEY_") && envValue === apiKey) {
      const projectKey = envKey.replace("BITVILLE_API_KEY_", "").toLowerCase();
      return { projectKey, isValid: true };
    }
  }

  return { projectKey: "", isValid: false };
}

async function handlePhpAgent(req: Request): Promise<Response> {
  // Authentication
  const auth = authenticateRequest(req);
  if (!auth.isValid) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" }
    });
  }

  // Parse and validate JSON
  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const parseResult = PhpPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    return new Response(JSON.stringify({
      error: "Validation failed",
      details: parseResult.error.errors
    }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const payload = parseResult.data;

  // Store in database
  try {
    insertData.run({
      $correlation_id: payload.correlation_id,
      $project: payload.project,
      $source: "php_agent",
      $timestamp: payload.timestamp,
      $duration_ms: payload.duration_ms,
      $payload: JSON.stringify(payload.profiling_data),
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Database Error]", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
```

### Systemd Service File
```ini
# Source: https://bun.sh/docs/guides/ecosystem/systemd
# /lib/systemd/system/bitville-listener.service

[Unit]
Description=Bitville Monitoring Central Listener
After=network.target

[Service]
Type=simple
User=bitville
WorkingDirectory=/opt/bitville-listener
ExecStart=/home/bitville/.bun/bin/bun run /opt/bitville-listener/src/server.ts
Restart=always
RestartSec=5

# Environment variables (or use EnvironmentFile=/etc/bitville/listener.env)
Environment=NODE_ENV=production
Environment=BITVILLE_DB_PATH=/var/lib/bitville/listener.db
Environment=BITVILLE_TLS_KEY_PATH=/etc/bitville/listener-key.pem
Environment=BITVILLE_TLS_CERT_PATH=/etc/bitville/listener-cert.pem
EnvironmentFile=/etc/bitville/listener-api-keys.env

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/bitville

[Install]
WantedBy=multi-user.target
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Node.js + Express | Bun + native Bun.serve | 2023-2024 | 2.5x faster HTTP performance, native TypeScript |
| better-sqlite3 | bun:sqlite | 2023 | 3-6x faster reads, native to runtime, zero build step |
| System cron | In-process cron (croner) | 2024-2026 | Better TypeScript integration, portable, easier testing |
| DELETE journal mode | WAL mode | 2010+ (standard) | Concurrent reads during writes, 2-3x write throughput |
| Manual JSON validation | Zod/runtime validation | 2021+ | Type inference, detailed errors, composable |
| Connection pooling | Single connection | N/A (SQLite) | SQLite is embedded, single connection suffices |

**Deprecated/outdated:**
- **Express/Fastify with Bun:** Frameworks add overhead; Bun.serve routes are faster and simpler
- **better-sqlite3 in Bun:** bun:sqlite is native, faster, and requires no compilation
- **dotenv package:** Bun loads .env files automatically, no package needed
- **nodemon/ts-node-dev:** Bun has built-in --hot flag for development reloading

## Open Questions

Things that couldn't be fully resolved:

1. **Rate limiting strategy for authentication endpoints**
   - What we know: Standard practice is 5 login attempts per 15 minutes, implemented via in-memory Map or Redis for distributed systems
   - What's unclear: Whether to implement rate limiting in Phase 3 or defer to Phase 7 (deployment) with firewall/fail2ban
   - Recommendation: Implement basic in-memory rate limiting per IP address (100 requests/minute) in Phase 3 for protection against basic abuse

2. **UDP socket backpressure handling**
   - What we know: Bun.udpSocket supports send/sendMany backpressure detection via return value and drain callback
   - What's unclear: Whether UDP drops are acceptable for this use case (fire-and-forget), or if we need retry logic
   - Recommendation: Accept UDP drops for now, prioritize HTTP POST for reliability, treat UDP as optional future optimization

3. **SQLite VACUUM strategy for long-running production**
   - What we know: VACUUM reclaims space but requires write lock, auto_vacuum=INCREMENTAL allows gradual reclamation
   - What's unclear: Optimal incremental_vacuum frequency/page count for 7-day retention with hourly deletes
   - Recommendation: Use auto_vacuum=INCREMENTAL with PRAGMA incremental_vacuum(100) during hourly cleanup, monitor database file size

4. **Self-signed certificate vs Let's Encrypt**
   - What we know: Self-signed certificates work for internal networks but require client configuration, Let's Encrypt is free and trusted by default
   - What's unclear: Whether server has public DNS and can use Let's Encrypt HTTP-01 challenge
   - Recommendation: Start with self-signed certificates (user decision in CONTEXT.md), document client configuration for PHP agents, optionally migrate to Let's Encrypt in deployment phase

## Sources

### Primary (HIGH confidence)
- [Bun HTTP Server API](https://bun.sh/docs/api/http) - Bun.serve configuration, routes, TLS
- [Bun TLS Configuration](https://bun.sh/guides/http/tls) - TLS setup with certificates
- [Bun SQLite API](https://bun.sh/docs/api/sqlite) - bun:sqlite usage, prepared statements, WAL mode
- [Bun UDP Socket API](https://bun.sh/docs/api/udp) - Bun.udpSocket for UDP listeners
- [Bun TCP Socket API](https://bun.sh/docs/api/tcp) - Bun.listen for server patterns
- [Bun Environment Variables](https://bun.sh/docs/runtime/environment-variables) - Bun.env usage
- [Bun systemd Guide](https://bun.sh/docs/guides/ecosystem/systemd) - systemd service file configuration
- [SQLite WAL Mode](https://sqlite.org/wal.html) - Official SQLite WAL documentation
- [SQLite JSON Functions](https://sqlite.org/json1.html) - JSON extraction and indexing

### Secondary (MEDIUM confidence)
- [SQLite Performance Tuning](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/) - WAL optimization, cache sizing
- [SQLite JSON Virtual Columns & Indexing](https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing) - JSON indexing patterns
- [Croner GitHub](https://github.com/Hexagon/croner) - Cron scheduling library for Bun/Node/Deno
- [Better Stack: Rate Limiting](https://betterstack.com/community/guides/scaling-nodejs/rate-limiting-express/) - Rate limiting patterns
- [Bun API Rate Limiting](https://www.codingtag.com/bun-api-rate-limiting) - In-memory rate limiting with Bun
- [Bearer Auth Middleware Patterns](https://medium.com/@mendes.develop/authentication-and-authorization-made-easy-with-hot-js-runtime-1fa42e8f7905) - Authentication middleware for Bun
- [systemd Service Environment Variables](https://www.baeldung.com/linux/systemd-services-environment-variables) - Environment configuration for systemd

### Tertiary (LOW confidence - community discussions)
- [Bun vs better-sqlite3 Discussion](https://github.com/WiseLibs/better-sqlite3/discussions/1057) - Performance comparison debate
- [Middleware Support for Bun.serve Issue](https://github.com/oven-sh/bun/issues/17608) - Native middleware patterns discussion
- [Built-in Tasks Scheduler Feature Request](https://github.com/oven-sh/bun/issues/13395) - In-process scheduling discussion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All official Bun documentation, production-ready in 2026
- Architecture: HIGH - Patterns verified from official docs and production usage
- Pitfalls: HIGH - Based on SQLite official docs and known WAL mode issues
- Open questions: MEDIUM - Rate limiting and VACUUM strategies need validation in production

**Research date:** 2026-01-27
**Valid until:** 2026-04-27 (90 days - Bun is stable, SQLite is mature)
