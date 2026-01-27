# Phase 3 Context: Central Listener Data Reception & Storage

**Phase:** 3
**Goal:** Central server receives, stores, and correlates profiling data from multiple agents
**Gathered:** 2026-01-27

## Discussion Summary

Phase 3 implements the central listener server that receives profiling data from PHP agents (multiple web servers) and monitoring data from the Postgres agent (database server). The listener stores data locally in SQLite and forwards to Graylog.

**Key architectural decisions:**
- Bun runtime (TypeScript) for the listener server
- Both HTTP POST and UDP protocols supported
- TLS/HTTPS required for security
- Per-project API key authentication
- SQLite with WAL mode for local storage
- JSON columns for nested profiling data
- 7-day retention with hourly cleanup
- Correlation happens at query time (on-demand)

---

## 1. Protocol & Port Choices

### Protocol Support
**Decision:** Both HTTP POST and UDP supported

**Rationale:**
- HTTP POST: Reliable delivery for critical profiling payloads, authentication via headers
- UDP: Low-latency option for high-volume scenarios, fire-and-forget
- PHP agents use HTTP POST (already implemented in transmitter.php)
- Postgres agent will use HTTP POST (to be implemented in Phase 5)
- UDP available as future optimization if needed

### Port Strategy
**Decision:** Claude decides

**Considerations:**
- HTTP listener on standard port (e.g., 8443 for HTTPS)
- UDP listener on separate port if implemented (e.g., 8444)
- Both should be documented in firewall configuration (Phase 7)
- Health check endpoint on separate port (e.g., 9191, matching PHP daemon convention)

### Encryption
**Decision:** TLS required (HTTPS)

**Rationale:**
- Profiling data may contain sensitive request metadata
- Authentication tokens (API keys) must be encrypted in transit
- Correlation IDs and SQL queries are business-sensitive
- Bun has built-in TLS support

**Implementation:**
- Self-signed certificates acceptable for initial deployment
- Certificate paths configured via environment variables
- HTTP-to-HTTPS redirect not needed (agents configured for HTTPS directly)

### HTTP Server Choice
**Decision:** Bun built-in HTTP server

**Rationale:**
- Native Bun.serve() is high-performance
- No framework overhead (Express, Fastify, etc.)
- Simpler dependency management
- Built-in TLS support
- Matches project goal of minimal complexity

---

## 2. Authentication & Authorization

### Authentication Method
**Decision:** API key authentication

**Rationale:**
- Simple to implement and deploy
- Sufficient security for internal network (web/DB servers → listener)
- No user accounts or session management needed
- Static keys easy to configure in PHP agent and Postgres agent

### Key Scope
**Decision:** Per-project API keys

**Rationale:**
- Multi-project support is a core requirement (STOR-04)
- Isolates projects at authentication layer
- Compromised key only affects one project
- Allows per-project access control in future

**Implementation:**
- Each project gets unique API key (UUID or similar)
- PHP agents configured with their project's key
- Postgres agent includes project key from PHP application_name

### Key Storage on Listener
**Decision:** Environment variables

**Rationale:**
- Standard practice for sensitive configuration
- Easy to update without code changes
- Supported by systemd service files
- Can migrate to file-based secrets if needed

**Format:**
```bash
BITVILLE_API_KEY_PROJECT1=key-abc123...
BITVILLE_API_KEY_PROJECT2=key-def456...
```

### Project Identification
**Decision:** Project identifier in request payload

**Rationale:**
- Allows single API key to be reused across projects if needed
- Explicit project tracking in data
- Matches existing PHP agent implementation (BITVILLE_APM_PROJECT constant)

**Flow:**
1. Agent sends API key in `Authorization: Bearer <key>` header
2. Agent sends project name in JSON payload: `{"project": "myapp", ...}`
3. Listener validates key, then uses project field for data separation

---

## 3. Data Storage Schema

### Nested Data Storage
**Decision:** JSON columns for nested data

**Rationale:**
- Profiling payloads contain complex nested structures (XHProf data, SQL queries, metadata)
- SQLite supports JSON functions (json_extract, json_each)
- Avoids explosion of tables/columns for variable-depth data
- Matches data format from PHP agents (already JSON-encoded)

**Schema approach:**
- Store raw JSON payloads in TEXT columns
- Extract key fields for indexing (correlation_id, project, timestamp, duration)
- Query nested data using SQLite JSON functions when needed

### Table Structure
**Decision:** Unified table for all profiling data

**Rationale:**
- Simplifies correlation (single table for PHP + DB data)
- Easier retention policy (delete from one table)
- Avoids JOIN overhead for correlated queries
- Matches 7-day retention requirement (all data treated equally)

**Proposed schema:**
```sql
CREATE TABLE profiling_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correlation_id TEXT NOT NULL,
    project TEXT NOT NULL,
    source TEXT NOT NULL,  -- 'php_agent' or 'postgres_agent'
    timestamp INTEGER NOT NULL,  -- Unix timestamp
    duration_ms REAL,  -- NULL for DB-only records
    payload TEXT NOT NULL,  -- JSON
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### Indexes
**Decision:** Index on correlation_id, project+timestamp, duration, and Claude decides additional indexes

**User selections:**
- correlation_id (primary correlation lookup)
- project + timestamp (time-range queries per project)
- duration/elapsed_ms (slow request identification)
- Let Claude decide (additional optimization indexes)

**Proposed indexes:**
```sql
CREATE INDEX idx_correlation_id ON profiling_data(correlation_id);
CREATE INDEX idx_project_timestamp ON profiling_data(project, timestamp);
CREATE INDEX idx_duration ON profiling_data(duration_ms) WHERE duration_ms IS NOT NULL;
CREATE INDEX idx_source_timestamp ON profiling_data(source, timestamp);  -- Claude addition for agent-specific queries
```

### Query Optimization
**Decision:** Prepared statements

**Rationale:**
- Protection against SQL injection (even though input is from trusted agents)
- Query plan caching for repeated queries
- Standard practice for SQLite in production
- No connection pooling needed (SQLite is embedded, single process)

---

## 4. Correlation & Retention

### Correlation Timing
**Decision:** On query (lazy correlation)

**Rationale:**
- PHP and DB data may arrive at different times
- No need for real-time correlation (not a streaming dashboard)
- Simpler implementation (no background correlation worker)
- Correlation happens when user searches/views data

**Implementation:**
- Store all incoming data immediately (no correlation processing)
- When querying, JOIN on correlation_id to link PHP request with DB activity
- Query API (Phase 6) handles correlation logic

### Cleanup Frequency
**Decision:** Hourly cron job

**Rationale:**
- Prevents database bloat from accumulating
- Spreads delete operations evenly (no huge daily batch)
- Matches typical profiling data arrival rate (continuous throughout day)
- Low overhead for SQLite DELETE operations

**Implementation:**
```sql
DELETE FROM profiling_data
WHERE timestamp < strftime('%s', 'now') - (7 * 24 * 60 * 60);
```

Run via cron: `0 * * * * /usr/local/bin/bitville-cleanup.sh`

### Old Data Handling
**Decision:** Hard delete after 7 days

**Rationale:**
- Matches STOR-02 requirement: "7-day automatic retention"
- Graylog stores long-term data (listener is short-term buffer)
- Simplifies storage management (no archive tables)
- Listener disk space remains bounded

**Flow:**
1. Data arrives → stored in SQLite → forwarded to Graylog (Phase 4)
2. Graylog has permanent copy
3. After 7 days → deleted from SQLite
4. Historical analysis uses Graylog, recent analysis uses listener

### Orphaned Data Handling
**Decision:** Claude decides (keep all data)

**Rationale:**
- PHP requests without DB activity are valid use cases:
  - Pages that only read from cache
  - Pages with no database queries (static content generation)
  - Profiling threshold captures slow requests that may not hit DB
- DB activity without PHP correlation is possible:
  - Direct SQL from admin tools
  - Background jobs outside PHP profiler scope
  - Postgres agent captures all activity, not just correlated requests
- Both data types provide value independently:
  - PHP-only data: Shows application-layer bottlenecks
  - DB-only data: Shows database load from all sources

**Implementation:**
- No special handling needed
- Query API returns PHP records even if no matching DB activity
- Query API returns DB records even if no matching PHP request
- UI (Phase 6) can optionally flag "no correlation found" for investigation

---

## Technical Constraints

### Runtime
- **Language:** TypeScript with Bun runtime (requirement from research phase)
- **Reason:** Bun provides high-performance HTTP server, native TypeScript support, and fast startup

### Database
- **Engine:** SQLite with WAL mode (Write-Ahead Logging)
- **Reason:** Simple deployment (no separate DB process), WAL mode allows concurrent reads during writes

### Server
- **Location:** 88.198.22.206 (central listener server)
- **Reason:** Specified in requirements, separate from web/DB servers

### Data Sources
- **PHP Agents:** Multiple web servers send profiling data via HTTP POST
- **Postgres Agent:** Single DB server (5.9.121.222) sends monitoring data via HTTP POST

---

## Success Criteria (from Phase 3 Roadmap)

This context informs plans that must achieve:

1. Listener accepts profiling data from multiple PHP agents via HTTP/UDP
2. Listener accepts monitoring data from Postgres agent via HTTP
3. Listener only accepts connections from authorized servers (API key validation)
4. Incoming data is parsed into structured format automatically
5. PHP requests are correlated with database activity via correlation ID
6. All data is stored in SQLite database with WAL mode enabled
7. Data older than 7 days is automatically deleted (hourly cleanup)
8. Data is indexed by correlation ID, project, timestamp, and duration
9. Multi-project data is separated and filterable

---

## Open Questions

None - all critical decisions made during discussion phase.

---

## References

- Phase 2 transmitter.php: HTTP POST implementation already exists
- Phase 3 research: Bun server architecture identified
- ROADMAP.md Phase 3 requirements: LIST-01 through LIST-05, STOR-01 through STOR-04
- Phase 5 dependency: Postgres agent will use same HTTP POST protocol

---

**Context complete.** Ready for plan execution.
