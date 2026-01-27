---
phase: 03-central-listener
plan: 02
subsystem: api
tags: [bun, http, tls, authentication, api-keys, zod, validation, bearer-token]

# Dependency graph
requires:
  - phase: 03-01
    provides: SQLite database with WAL mode, unified profiling_data table, prepared statements
provides:
  - HTTP/HTTPS server accepting authenticated profiling data
  - API key authentication via Bearer tokens
  - JSON validation with Zod schemas
  - Request handlers for PHP and Postgres agents
  - Health and readiness endpoints for monitoring
affects: [03-03-retention, 04-graylog-integration, php-agent-daemon]

# Tech tracking
tech-stack:
  added: [zod@3.0.0]
  patterns: [Bearer token authentication, Zod validation, Bun.serve routing]

key-files:
  created:
    - listener/src/middleware/auth.ts
    - listener/src/middleware/validation.ts
    - listener/src/handlers/php-agent.ts
    - listener/src/handlers/postgres-agent.ts
    - listener/src/server.ts
  modified: []

key-decisions:
  - "API keys cached at module initialization for performance (not per-request lookup)"
  - "Use authenticated project name from API key, not payload project field (security)"
  - "TLS optional: HTTPS when certs provided, HTTP fallback for development"
  - "Static /health endpoint for fast monitoring, dynamic /ready with diagnostics"
  - "Graceful shutdown allows in-flight requests to complete (SIGTERM)"

patterns-established:
  - "Authentication middleware returns AuthContext with isValid/projectKey/error"
  - "Handlers follow 5-step flow: auth → parse → validate → store → respond"
  - "All error responses include JSON with error/message/details structure"
  - "Console logging with [Component] prefix for categorization"

# Metrics
duration: 4min 39sec
completed: 2026-01-27
---

# Phase 3 Plan 2: HTTP Server with Authentication Summary

**Bun HTTP/HTTPS server with Bearer token authentication, Zod payload validation, and dual ingestion endpoints for PHP and Postgres agents**

## Performance

- **Duration:** 4min 39sec
- **Started:** 2026-01-27T20:01:54Z
- **Completed:** 2026-01-27T20:06:33Z
- **Tasks:** 3/3
- **Files created:** 5
- **Commits:** 3 task commits

## Accomplishments

- API key authentication middleware with environment-based key loading (BITVILLE_API_KEY_*)
- Zod schemas for PHP and Postgres payload validation with detailed error messages
- Request handlers for /ingest/php and /ingest/postgres with auth, validation, and storage
- Bun.serve HTTP/HTTPS server with optional TLS, health checks, and graceful shutdown
- Comprehensive test coverage: authentication, validation, error handling, integration tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Create authentication middleware** - `8861d6e` (feat)
   - API key extraction from Bearer token
   - Environment variable caching at startup
   - AuthContext validation result structure
   - Test coverage for valid/invalid/missing tokens

2. **Task 2: Create validation schemas and request handlers** - `d862f85` (feat)
   - Zod schemas matching listener.php payload structure
   - PHP agent handler with 5-step processing flow
   - Postgres agent handler ready for Phase 5
   - Integration tests with database verification

3. **Task 3: Create main HTTP server with TLS** - `8931cfa` (feat)
   - Bun.serve with optional TLS configuration
   - Static /health and dynamic /ready endpoints
   - Route handling for ingestion endpoints
   - Graceful shutdown handlers (SIGTERM/SIGINT)

## Files Created/Modified

### Created

- **listener/src/middleware/auth.ts** - Bearer token authentication with API key validation from environment
- **listener/src/middleware/validation.ts** - Zod schemas for PHP and Postgres agent payloads
- **listener/src/handlers/php-agent.ts** - POST /ingest/php handler with auth, validation, storage
- **listener/src/handlers/postgres-agent.ts** - POST /ingest/postgres handler for Phase 5 integration
- **listener/src/server.ts** - Main Bun.serve entry point with TLS, routing, health checks, graceful shutdown
- **listener/src/middleware/auth.test.ts** - Authentication middleware test suite
- **listener/src/handlers/handlers.test.ts** - Request handler integration tests

### Modified

None - all new code for this plan.

## Decisions Made

**1. API key caching at module initialization**
- **Rationale:** Scanning environment variables on every request would be wasteful. Cache keys in Map at startup for O(1) lookup per request.
- **Implementation:** Module-level loadApiKeys() called once, refreshApiKeys() exported for runtime updates.

**2. Use authenticated project name, not payload project field**
- **Rationale:** Security - trust the API key authentication, not the payload claim. Prevents project impersonation.
- **Implementation:** insertProfilingData receives auth.projectKey from Bearer token, not payload.project.

**3. TLS optional: HTTPS when certificates provided, HTTP fallback**
- **Rationale:** Simplifies development (no cert generation) while supporting production security.
- **Implementation:** Check BITVILLE_TLS_KEY_PATH and BITVILLE_TLS_CERT_PATH, conditionally set tls config.

**4. Static /health endpoint, dynamic /ready with diagnostics**
- **Rationale:** Health checks should be fast (monitoring systems poll frequently). Readiness provides detailed status for debugging.
- **Implementation:** /health returns "OK" text immediately, /ready checks database and API key count.

**5. Graceful shutdown allows in-flight requests**
- **Rationale:** Prevent data loss when restarting listener. SIGTERM in orchestration (Kubernetes, systemd) should drain gracefully.
- **Implementation:** server.stop(false) on SIGTERM allows requests to finish, server.stop(true) on SIGINT for immediate dev interruption.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed HTTP header trailing space handling in auth test**
- **Found during:** Task 1 (Authentication middleware testing)
- **Issue:** Test expected "Authorization: Bearer " (with trailing space) to trigger "Empty API key" error, but HTTP headers automatically trim trailing whitespace, causing "Missing Bearer token" error instead.
- **Fix:** Updated test expectation to match actual HTTP behavior - trailing spaces are trimmed by Request implementation.
- **Files modified:** listener/src/middleware/auth.test.ts
- **Verification:** All authentication tests pass (7/7)
- **Committed in:** 8861d6e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Test correction to match standard HTTP header behavior. No functional changes to production code.

## Issues Encountered

None - plan executed smoothly with database foundation from 03-01 providing clean integration points.

## Requirements Satisfied

- **LIST-01**: Central listener receives profiling data from PHP agents via POST /ingest/php
- **LIST-02**: Central listener receives database metrics from Postgres agent via POST /ingest/postgres
- **LIST-03**: Authorization via API key authentication (application-level Bearer tokens) - network firewall out of scope per plan notes
- **LIST-04**: Parse and validate JSON payloads with Zod schemas, store in SQLite with prepared statements

## User Setup Required

**Environment variables needed before starting listener:**

```bash
# Required: Database path
export BITVILLE_DB_PATH=/var/lib/bitville/listener.db

# Required: At least one API key per project
export BITVILLE_API_KEY_MYPROJECT=<generate-uuid-v4>
export BITVILLE_API_KEY_PRODUCTION=<generate-uuid-v4>

# Optional: Server configuration
export BITVILLE_PORT=8443

# Optional: TLS certificates (HTTPS)
export BITVILLE_TLS_KEY_PATH=/path/to/server.key
export BITVILLE_TLS_CERT_PATH=/path/to/server.crt
```

**Verification:**

```bash
# Start listener
bun run listener/src/server.ts

# Check health
curl http://localhost:8443/health

# Check readiness (should show api_keys > 0)
curl http://localhost:8443/ready
```

## Next Phase Readiness

**Ready for:**
- **03-03 Retention**: Database and ingestion running, can add retention cleanup
- **04-Graylog Integration**: HTTP layer complete, can add forwarding logic
- **PHP Agent Daemon**: POST /ingest/php endpoint accepting data

**Dependencies complete:**
- Database layer (03-01): SQLite with WAL mode, prepared statements
- HTTP layer (03-02): Authentication, validation, storage endpoints

**No blockers.** All LIST-01 through LIST-04 requirements satisfied.

---
*Phase: 03-central-listener*
*Completed: 2026-01-27*
