# Phase 4: Graylog Integration & Forwarding - Research

**Researched:** 2026-01-27
**Domain:** GELF protocol, Bun/TypeScript GELF clients, circuit breaker pattern, async event-driven forwarding
**Confidence:** HIGH

## Summary

This phase implements forwarding of all profiling data from the central listener to Graylog using the GELF (Graylog Extended Log Format) protocol over TCP. The critical finding is that requirement GELF-02 specifies `graylog2/gelf-php 1.7.x` which is a PHP library, but the listener is built with Bun/TypeScript. This mismatch must be resolved.

Research identified three viable approaches: (1) use existing Node.js GELF libraries like `gelf-pro` which work with Bun's Node.js compatibility layer, (2) use modern TypeScript-native libraries like `gelf-client`, or (3) manually implement GELF TCP which is straightforward given the simple protocol. The circuit breaker pattern is well-established with the `opossum` library providing production-ready implementation. Event-driven async forwarding fits naturally with Bun's async capabilities and fire-and-forget patterns.

**Primary recommendation:** Use `gelf-pro` npm package (TCP adapter) with `opossum` circuit breaker for immediate forwarding, add `forwarded_to_graylog` INTEGER column to SQLite for replay tracking, and trigger async forwards using fire-and-forget promises after each insert.

## Standard Stack

The established libraries/tools for GELF integration in Node.js/Bun environments:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gelf-pro | 1.4.x | GELF client for Node.js | Mature (tested on Node 0.x-20.x), supports TCP/TLS adapters, handles message formatting, works with Bun's Node.js compatibility |
| opossum | 8.x | Circuit breaker for Node.js | Production-hardened, TypeScript support, event-driven state management, configurable thresholds |
| bun:sqlite | Built-in | Database for buffering | Native Bun API, already in use by listener, high performance |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gelf-client | 3.x | TypeScript-native GELF | Alternative if gelf-pro has Bun issues; written in TypeScript |
| node:net | Built-in | Manual TCP socket | Only if manual GELF implementation needed (unlikely) |
| node:fs | Built-in | Circuit breaker state persistence | Simple JSON file writes for state |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gelf-pro | Manual GELF implementation | Manual: full control, more code. gelf-pro: proven, less code |
| opossum | Custom circuit breaker | Custom: exact fit for needs. opossum: battle-tested, more features |
| SQLite flag column | Separate queue table | Separate table: normalized. Flag column: simpler queries, fits existing schema |

**Installation:**
```bash
cd listener
bun add gelf-pro opossum
bun add -d @types/opossum
```

**Bun Compatibility Note:** Bun supports 95%+ of Node.js APIs including `node:net` for TCP sockets. Both `gelf-pro` and `opossum` should work with Bun's Node.js compatibility layer. If issues arise, fallback to manual GELF TCP implementation is straightforward.

## Architecture Patterns

### Recommended Project Structure
```
listener/src/
├── graylog/
│   ├── client.ts              # GELF client wrapper (gelf-pro config)
│   ├── circuit-breaker.ts     # Circuit breaker setup (opossum)
│   ├── forwarder.ts           # Main forwarding logic
│   ├── replay.ts              # Replay unforwarded records
│   └── state.ts               # Circuit breaker state persistence
├── database/
│   ├── migrations/
│   │   └── 001-add-forwarded-flag.sql  # ALTER TABLE for new column
│   └── queries.ts             # Updated with replay queries
```

### Pattern 1: Event-Driven Async Forwarding
**What:** Trigger GELF forward immediately after SQLite insert, but don't await the result
**When to use:** Every ingestion request (PHP agent, Postgres agent)
**Example:**
```typescript
// In handlers (php-agent.ts, postgres-agent.ts)
import { forwardToGraylog } from "../graylog/forwarder.ts";

// After successful insertProfilingData()
const rowId = insertProfilingData({ /* ... */ });

// Fire-and-forget async forward (don't await)
forwardToGraylog(rowId, payload).catch(err => {
  console.error("[Graylog] Forward failed:", err);
  // Error logged, circuit breaker handles state
});

// Return response immediately (don't wait for Graylog)
return new Response(JSON.stringify({ success: true }), { status: 200 });
```

### Pattern 2: Circuit Breaker with State Persistence
**What:** Wrap GELF send operation in circuit breaker, persist state to survive restarts
**When to use:** All Graylog TCP connections
**Example:**
```typescript
// Source: Opossum documentation + custom state persistence
import CircuitBreaker from "opossum";
import { writeFileSync, readFileSync } from "node:fs";

const STATE_FILE = "/var/lib/bitville/circuit-breaker-state.json";

// Load persisted state on startup
let persistedState = null;
try {
  persistedState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
} catch { /* File doesn't exist on first run */ }

const breaker = new CircuitBreaker(sendToGraylog, {
  timeout: 5000,                    // 5 second timeout per send
  errorThresholdPercentage: 50,     // Open after 50% failures
  resetTimeout: 60000,              // 60 second retry timeout (matches PHP agent)
  volumeThreshold: 5,               // Minimum 5 requests before calculating percentage
  state: persistedState,            // Restore previous state
});

// Persist state changes to disk
breaker.on("open", () => {
  console.log("[Circuit Breaker] OPEN - Graylog unavailable");
  persistState();
});

breaker.on("close", () => {
  console.log("[Circuit Breaker] CLOSED - Graylog recovered");
  persistState();
  // Trigger replay of buffered records
  replayUnforwardedRecords();
});

breaker.on("halfOpen", () => {
  console.log("[Circuit Breaker] HALF-OPEN - Testing Graylog");
  persistState();
});

function persistState() {
  writeFileSync(STATE_FILE, JSON.stringify(breaker.toJSON()), "utf-8");
}
```

### Pattern 3: SQLite Flag Column for Replay Tracking
**What:** Add INTEGER column `forwarded_to_graylog` (0=pending, 1=forwarded) with index
**When to use:** Schema migration for profiling_data table
**Example:**
```sql
-- Source: SQLite ALTER TABLE best practices
-- File: listener/src/database/migrations/001-add-forwarded-flag.sql

-- Add column with default 0 (not forwarded) and NOT NULL constraint
ALTER TABLE profiling_data
ADD COLUMN forwarded_to_graylog INTEGER NOT NULL DEFAULT 0
CHECK(forwarded_to_graylog IN (0, 1));

-- Index for efficient replay queries (WHERE forwarded_to_graylog = 0)
CREATE INDEX IF NOT EXISTS idx_forwarded_to_graylog
ON profiling_data(forwarded_to_graylog, id);

-- Note: New inserts will default to 0, existing rows also get 0
```

### Pattern 4: FIFO Replay Queue
**What:** Query unforwarded records ordered by ID (insertion order), forward batch, update flags
**When to use:** After circuit breaker closes (Graylog recovers)
**Example:**
```typescript
// Source: Replay queue patterns + SQLite queries
async function replayUnforwardedRecords() {
  const BATCH_SIZE = 100;
  let processedCount = 0;

  while (true) {
    // Fetch oldest unforwarded records
    const records = db.prepare(`
      SELECT id, correlation_id, project, source, timestamp, duration_ms, payload
      FROM profiling_data
      WHERE forwarded_to_graylog = 0
      ORDER BY id ASC
      LIMIT ?
    `).all(BATCH_SIZE);

    if (records.length === 0) break;

    for (const record of records) {
      try {
        // Forward through circuit breaker
        await breaker.fire(record);

        // Mark as forwarded on success
        db.prepare("UPDATE profiling_data SET forwarded_to_graylog = 1 WHERE id = ?")
          .run(record.id);

        processedCount++;
      } catch (err) {
        console.error(`[Replay] Failed to forward record ${record.id}:`, err);
        // Circuit breaker likely opened again, stop replay
        break;
      }
    }

    // If we didn't process full batch, circuit likely opened
    if (records.length < BATCH_SIZE) break;
  }

  console.log(`[Replay] Forwarded ${processedCount} buffered records`);
}
```

### Pattern 5: GELF Field Mapping
**What:** Map profiling_data columns and payload to GELF message structure
**When to use:** Every message sent to Graylog
**Example:**
```typescript
// Source: GELF specification + user context decisions
import type { ProfilingDataRow } from "../types/payloads.ts";

function buildGelfMessage(record: ProfilingDataRow): object {
  const payload = JSON.parse(record.payload);

  return {
    // Required GELF fields
    version: "1.1",
    host: record.source,  // "php_agent" or "postgres_agent"
    short_message: `${record.source} - ${record.project}`,

    // Optional GELF fields
    timestamp: record.timestamp,  // Unix timestamp (already numeric)
    level: 6,  // INFO level (syslog)
    full_message: record.payload,  // Complete JSON payload

    // Custom fields (underscore prefix required)
    _correlation_id: record.correlation_id,
    _project: record.project,
    _source: record.source,
    _duration_ms: record.duration_ms,
    _row_id: record.id,

    // Extract request context from payload if present
    ...(payload.request?.url && { _url: payload.request.url }),
    ...(payload.request?.method && { _method: payload.request.method }),
    ...(payload.response?.status_code && { _status_code: payload.response.status_code }),
  };
}
```

### Anti-Patterns to Avoid
- **Awaiting Graylog forwards in request handlers:** Blocks ingestion, defeats async design. Forward should be fire-and-forget.
- **Opening new socket per message:** gelf-pro already handles connection lifecycle correctly.
- **Retry logic inside forward function:** Circuit breaker handles failure detection and recovery, don't duplicate retry logic.
- **Polling for unforwarded records:** Event-driven replay on circuit close is more efficient than polling loops.
- **Boolean TRUE/FALSE in SQLite schema:** SQLite stores booleans as integers 0/1, use INTEGER type with CHECK constraint.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circuit breaker state machine | Custom open/closed/half-open logic | opossum library | Complex edge cases: timing windows, concurrent requests, percentage calculations, volume thresholds, event emission. Opossum is battle-tested with 1500+ GitHub stars. |
| GELF message formatting | Manual JSON construction with field validation | gelf-pro library | Field name validation (regex), underscore prefix enforcement, nested object flattening, proper null byte delimiter, error stack extraction. gelf-pro handles all GELF spec nuances. |
| Connection pooling | Custom socket reuse | Use gelf-pro's default (no pooling) | Library intentionally doesn't reuse sockets for "better resource utilization" - they've done the performance analysis. |
| Retry backoff | Custom exponential backoff | Circuit breaker's resetTimeout | Circuit breaker pattern inherently handles retry timing with half-open testing. Adding custom backoff creates conflicting retry logic. |

**Key insight:** Both GELF protocol and circuit breaker pattern have subtle requirements (null byte framing, half-open state transitions, percentage-based failure thresholds) that are easy to get wrong. Use proven libraries.

## Common Pitfalls

### Pitfall 1: Blocking Ingestion on Graylog Forwards
**What goes wrong:** Handler awaits `forwardToGraylog()`, so ingestion response is delayed until Graylog responds. When Graylog is slow or down, ingestion becomes slow or fails.
**Why it happens:** Natural instinct to await async operations for error handling.
**How to avoid:** Use fire-and-forget pattern: call `forwardToGraylog().catch()` without awaiting. Circuit breaker handles errors internally.
**Warning signs:** Ingestion response times correlate with Graylog latency. `/ready` endpoint shows slow responses.

### Pitfall 2: Circuit Breaker State Not Persisting Across Restarts
**What goes wrong:** Listener restarts during Graylog outage. Circuit breaker starts in CLOSED state, immediately floods Graylog with connection attempts, circuit opens again. Creates retry storm on every restart.
**Why it happens:** Default circuit breaker state is in-memory only.
**How to avoid:** Persist circuit breaker state to disk on state transitions (open/close/halfOpen events). Load state from disk on startup using `opossum` constructor options.
**Warning signs:** Log shows burst of connection failures immediately after restart during known Graylog outages.

### Pitfall 3: Forgetting Null Byte Delimiter on TCP
**What goes wrong:** GELF messages sent over TCP without `\0` terminator. Graylog can't parse message boundaries, messages are silently dropped or corrupted.
**Why it happens:** Common TCP streaming doesn't require delimiters, but GELF TCP spec mandates `\0`.
**How to avoid:** Use `gelf-pro` library which handles null byte framing automatically. If implementing manually, append `\0` to JSON before socket write.
**Warning signs:** Graylog receives no messages, but no errors in listener logs. Wireshark shows JSON over TCP but Graylog doesn't parse it.

### Pitfall 4: Race Condition Between Insert and Forward
**What goes wrong:** `forwardToGraylog(rowId)` fires immediately after insert, but reads row from database before transaction commits. Row not found or incomplete data forwarded.
**Why it happens:** Fire-and-forget async combined with SQLite transaction timing.
**How to avoid:** Pass payload data directly to forward function instead of refetching by rowId. Or ensure insert uses synchronous prepared statement (Bun's `bun:sqlite` is synchronous by default).
**Warning signs:** Intermittent "row not found" errors in forward function. Messages missing from Graylog.

### Pitfall 5: Replay Infinite Loop During Graylog Instability
**What goes wrong:** Replay starts when circuit closes, forwards first batch successfully, but Graylog fails on second batch. Circuit opens again. Closes 60s later, triggers replay again. Infinite loop.
**Why it happens:** Replay doesn't check circuit breaker state before/during processing.
**How to avoid:** Wrap replay forwards in circuit breaker's `.fire()` method. When circuit opens mid-replay, catch error and exit replay loop cleanly.
**Warning signs:** Logs show repeated replay starts every 60 seconds during Graylog partial outages.

### Pitfall 6: SQLite Schema Migration Breaking Existing Code
**What goes wrong:** Adding `forwarded_to_graylog` column without updating SELECT queries. Existing query functions fail or return incomplete rows.
**Why it happens:** TypeScript types aren't automatically updated to match schema changes.
**How to avoid:** Run migration, then update TypeScript types and ALL query functions. Test existing functionality after migration. Use `SELECT *` sparingly (prefer explicit columns).
**Warning signs:** TypeScript doesn't catch missing field errors. Runtime errors about undefined properties.

## Code Examples

Verified patterns from official sources and research:

### GELF Client Configuration (gelf-pro)
```typescript
// Source: https://github.com/kkamkou/node-gelf-pro
import log from "gelf-pro";

log.setConfig({
  fields: {
    facility: "bitville-listener",
    environment: Bun.env.ENVIRONMENT || "production",
  },
  adapterName: "tcp",
  adapterOptions: {
    host: Bun.env.GRAYLOG_HOST || "127.0.0.1",
    port: Number(Bun.env.GRAYLOG_PORT) || 12201,
    family: 4,        // IPv4
    timeout: 5000,    // 5 second timeout
  },
});

// Send custom message with additional fields
log.info("Profiling data forwarded", {
  _correlation_id: "abc123",
  _project: "myproject",
  _duration_ms: 150.5,
});
```

### Circuit Breaker Setup (opossum)
```typescript
// Source: https://github.com/nodeshift/opossum
import CircuitBreaker from "opossum";

// Function to protect with circuit breaker
async function sendGelfMessage(gelfPayload: object): Promise<void> {
  return new Promise((resolve, reject) => {
    // gelf-pro doesn't return promises, use callback
    log.info(gelfPayload.short_message, gelfPayload, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const breaker = new CircuitBreaker(sendGelfMessage, {
  timeout: 5000,                    // Match gelf-pro timeout
  errorThresholdPercentage: 50,     // Open after 50% failures
  resetTimeout: 60000,              // 60 second retry (matches PHP agent)
  volumeThreshold: 5,               // Need 5 requests before calculating %
});

// Usage
breaker.fire(gelfMessage)
  .then(() => console.log("Forwarded to Graylog"))
  .catch(err => console.error("Circuit breaker rejected:", err));
```

### State Persistence (Circuit Breaker)
```typescript
// Source: Opossum docs + Node.js fs
import { writeFileSync, readFileSync } from "node:fs";

const STATE_FILE = Bun.env.BITVILLE_STATE_PATH || "/var/lib/bitville/circuit-breaker-state.json";

function loadState(): any | null {
  try {
    const content = readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.log("[Circuit Breaker] No persisted state found, starting fresh");
    return null;
  }
}

function saveState(breaker: CircuitBreaker): void {
  const state = {
    state: breaker.toJSON(),
    timestamp: Date.now(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// Use in breaker initialization
const persistedState = loadState();
const breaker = new CircuitBreaker(sendGelfMessage, {
  // ... other options
  state: persistedState?.state,
});

breaker.on("open", () => saveState(breaker));
breaker.on("close", () => saveState(breaker));
breaker.on("halfOpen", () => saveState(breaker));
```

### SQLite Migration (Add Column)
```sql
-- Source: SQLite ALTER TABLE documentation
-- File: listener/src/database/migrations/001-add-forwarded-flag.sql

-- Add forwarded flag column
-- Default 0 means NOT forwarded (pending)
-- NOT NULL ensures all rows have explicit state
-- CHECK constraint enforces boolean-like values (0 or 1)
ALTER TABLE profiling_data
ADD COLUMN forwarded_to_graylog INTEGER NOT NULL DEFAULT 0
CHECK(forwarded_to_graylog IN (0, 1));

-- Index for replay queries (WHERE forwarded_to_graylog = 0)
-- Composite index with id for ORDER BY id ASC performance
CREATE INDEX IF NOT EXISTS idx_forwarded_to_graylog
ON profiling_data(forwarded_to_graylog, id);

-- Vacuum to reclaim space and rebuild indexes
PRAGMA incremental_vacuum;
```

### Replay Query with Flag Update
```typescript
// Source: Research on FIFO replay patterns + SQLite
import { getDatabase } from "../database/connection.ts";

export function getUnforwardedRecords(limit: number = 100): ProfilingDataRow[] {
  const db = getDatabase();
  if (!db) throw new Error("Database not initialized");

  const stmt = db.prepare(`
    SELECT id, correlation_id, project, source, timestamp, duration_ms, payload
    FROM profiling_data
    WHERE forwarded_to_graylog = 0
    ORDER BY id ASC
    LIMIT ?
  `);

  return stmt.all(limit) as ProfilingDataRow[];
}

export function markAsForwarded(rowId: number): void {
  const db = getDatabase();
  if (!db) throw new Error("Database not initialized");

  const stmt = db.prepare(`
    UPDATE profiling_data
    SET forwarded_to_graylog = 1
    WHERE id = ?
  `);

  stmt.run(rowId);
}
```

### Fire-and-Forget Async Pattern
```typescript
// Source: Bun background tasks documentation
// In handler after successful insert:

const rowId = insertProfilingData(data);

// Fire-and-forget: don't await, catch errors for logging only
forwardToGraylog(rowId, data).catch(err => {
  // Log error but don't fail the request
  console.error(`[Graylog] Forward failed for row ${rowId}:`, err);
  // Record remains in database with forwarded_to_graylog = 0
  // Replay will pick it up later
});

// Return immediately
return new Response(JSON.stringify({ success: true, row_id: rowId }), {
  status: 200,
  headers: { "content-type": "application/json" },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UDP transport for GELF | TCP transport preferred | 2020+ | TCP provides guaranteed delivery, no chunking complexity, simpler debugging. UDP still valid for very high volume. |
| Connection pooling | No connection reuse (ephemeral) | gelf-pro design | Library creates new socket per message to avoid resource leaks and complexity. Performance impact negligible for moderate volumes. |
| Synchronous forwarding | Async fire-and-forget | Modern async patterns (2022+) | Decouples ingestion from forwarding, prevents Graylog issues from blocking ingestion. |
| Custom retry logic | Circuit breaker pattern | Microservices era (2018+) | Circuit breaker prevents cascade failures, provides automatic recovery, emits events for monitoring. |
| Separate queue table | Flag column in main table | Simplification trend (2024+) | Simpler queries, fewer JOINs, flag column indexed for performance. Separate queue table only needed for complex priority/scheduling. |

**Deprecated/outdated:**
- **GELF UDP with chunking:** Still works but TCP is simpler and more reliable for moderate volumes.
- **gelf-stream (npm package):** Last updated 7 years ago, use gelf-pro or gelf-client instead.
- **Manual socket pooling:** Modern libraries handle connection lifecycle correctly without pooling.

## Open Questions

Things that couldn't be fully resolved:

1. **Bun compatibility with gelf-pro's TCP adapter**
   - What we know: Bun supports `node:net` module, gelf-pro uses `net.Socket`, 95%+ Node.js API compatibility.
   - What's unclear: No explicit testing documented for gelf-pro on Bun runtime. Possible edge cases with socket lifecycle.
   - Recommendation: Install and test gelf-pro in Bun development environment during plan implementation. If issues arise, fallback to manual GELF TCP implementation (straightforward: JSON + `\0` delimiter over `net.Socket`).

2. **Optimal circuit breaker threshold values**
   - What we know: User decided 5 consecutive failures and 60s retry timeout (matching Phase 2 PHP agent).
   - What's unclear: Opossum uses percentage-based thresholds (`errorThresholdPercentage`) not consecutive failure counts. Need to map "5 consecutive failures" to percentage + volume threshold.
   - Recommendation: Use `errorThresholdPercentage: 50` with `volumeThreshold: 5` to approximate "5 failures triggers open". Test under simulated Graylog outage to verify behavior matches expectations.

3. **Replay throttling under high buffer volumes**
   - What we know: User decided "no rate limiting during replay" - replay as fast as possible.
   - What's unclear: If 10,000+ records buffered during long outage, rapid replay might overwhelm recovered Graylog or cause listener resource exhaustion.
   - Recommendation: Start with batch size of 100 records per replay loop iteration. If circuit breaker opens mid-replay, stop cleanly. Monitor Graylog and listener resource usage during first production replay. Adjust batch size if needed.

4. **Database migration strategy for production**
   - What we know: Need to add `forwarded_to_graylog` column to existing profiling_data table.
   - What's unclear: Whether to migrate during listener downtime or use online migration. Whether existing records should default to 0 (not forwarded) or 1 (assume already sent to Graylog before this phase).
   - Recommendation: Default all existing records to `forwarded_to_graylog = 1` (assume previously sent, since Phase 4 is NEW functionality). Only new records after migration get 0. This prevents massive replay of historical data. Document migration in plan with SQL comments.

## Sources

### Primary (HIGH confidence)
- [GELF Format Specification](https://go2docs.graylog.org/current/getting_in_log_data/gelf_format.html) - Official Graylog docs, GELF 1.1 spec
- [GELF Inputs](https://go2docs.graylog.org/current/getting_in_log_data/gelf.html) - TCP transport details
- [gelf-pro npm package](https://www.npmjs.com/package/gelf-pro) - Node.js GELF client with TCP
- [gelf-pro GitHub](https://github.com/kkamkou/node-gelf-pro) - API documentation and examples
- [Opossum npm package](https://www.npmjs.com/package/opossum) - Node.js circuit breaker
- [Opossum GitHub](https://github.com/nodeshift/opossum) - Circuit breaker configuration and patterns
- [SQLite ALTER TABLE](https://sqlite.org/lang_altertable.html) - Official SQLite documentation
- [Bun Node.js Compatibility](https://bun.com/docs/runtime/nodejs-compat) - Bun's node:net support
- [Bun node:net module](https://bun.com/reference/node/net) - Socket.connect API documentation

### Secondary (MEDIUM confidence)
- [Circuit Breaker Pattern in Node.js and TypeScript](https://dev.to/wallacefreitas/circuit-breaker-pattern-in-nodejs-and-typescript-enhancing-resilience-and-stability-bfi) - Implementation patterns
- [Building Resilient Systems: Circuit Breakers and Retry Patterns](https://dasroot.net/posts/2026/01/building-resilient-systems-circuit-breakers-retry-patterns/) - 2026 best practices
- [Bun Background Tasks](https://www.codingtag.com/bun-background-tasks) - Fire-and-forget patterns
- [Bun Scheduler and Job Queues](https://www.codingtag.com/bun-scheduler-and-job-queues) - Async task patterns
- [SQLite Versioning and Migration Strategies](https://www.sqliteforum.com/p/sqlite-versioning-and-migration-strategies) - Migration best practices
- [SQLite Boolean Columns Guide](https://www.beekeeperstudio.io/blog/guide-to-boolean-columns-in-sqlite) - INTEGER for boolean storage

### Tertiary (LOW confidence)
- [gelf-client npm](https://www.npmjs.com/package/gelf-client) - Alternative TypeScript GELF client (not tested)
- WebSearch results for Node.js GELF libraries - General ecosystem overview
- WebSearch results for replay queue patterns - Conceptual patterns, not GELF-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - gelf-pro and opossum are well-documented, mature libraries with clear APIs
- Architecture: HIGH - Patterns verified against official Opossum/gelf-pro docs and GELF specification
- Pitfalls: MEDIUM - Based on general async patterns and circuit breaker anti-patterns, not GELF-specific war stories
- Bun compatibility: MEDIUM - Bun supports node:net, but gelf-pro not explicitly tested on Bun (fallback plan exists)

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days - stable technologies)

**Critical note for planner:** Requirement GELF-02 specifies "graylog2/gelf-php 1.7.x" but listener is Bun/TypeScript. Research assumes this is a documentation artifact from PHP-centric planning, and the spirit of the requirement is "use a mature, compatible GELF library" rather than literally using a PHP library in a TypeScript project. If this assumption is incorrect, escalate to user for clarification.
