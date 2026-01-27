---
phase: 04-graylog-integration
plan: 01
subsystem: storage
status: complete
requires:
  - 03-01-database-foundation
  - 03-02-http-server-authentication
provides:
  - forwarded_to_graylog-tracking-column
  - gelf-client-module
  - replay-query-functions
affects:
  - 04-02-forwarder-implementation
  - 04-03-circuit-breaker-integration
tags:
  - database
  - graylog
  - gelf
  - migration
  - tcp
tech-stack:
  added:
    - gelf-pro (1.4.0) - GELF TCP transport
    - opossum (9.0.0) - Circuit breaker pattern
  patterns:
    - database-migration-with-backward-compatibility
    - optional-feature-flag-pattern
decisions:
  - id: existing-records-default-1
    decision: "Existing records default forwarded_to_graylog=1 during migration"
    rationale: "Prevent massive replay of pre-Phase 4 historical data; assume already sent"
    impacts: ["replay-behavior"]
  - id: new-records-default-0
    decision: "New inserts default forwarded_to_graylog=0 via explicit INSERT"
    rationale: "Ensures new records are tracked for forwarding after Phase 4 activation"
    impacts: ["insert-queries"]
  - id: composite-index-forwarded-id
    decision: "Composite index on (forwarded_to_graylog, id) for replay queries"
    rationale: "Efficient FIFO replay queries with WHERE forwarded_to_graylog=0 ORDER BY id"
    impacts: ["query-performance"]
  - id: gelf-disabled-by-default
    decision: "GELF client disabled by default, enabled via GRAYLOG_ENABLED=true"
    rationale: "Safe rollout without requiring Graylog server upfront; opt-in activation"
    impacts: ["deployment", "configuration"]
key-files:
  created:
    - listener/src/graylog/client.ts
  modified:
    - listener/src/database/schema.sql
    - listener/src/database/connection.ts
    - listener/src/database/queries.ts
    - listener/src/types/payloads.ts
    - listener/package.json
    - listener/.env.example
metrics:
  tasks: 2
  commits: 2
  duration: "2min 31sec"
  completed: 2026-01-27
---

# Phase 4 Plan 1: Database Foundation and GELF Client Setup

**One-liner:** Added forwarded_to_graylog tracking column with migration logic and GELF TCP client module (gelf-pro) for Graylog integration foundation.

## What Was Built

### Task 1: Database Migration for Forwarding Tracking
- **Schema update:** Added `forwarded_to_graylog INTEGER NOT NULL DEFAULT 0 CHECK(forwarded_to_graylog IN (0, 1))` column
- **Migration logic:** Detects missing column and adds it with DEFAULT 1 for existing records (backward compatibility)
- **Index creation:** Composite index `idx_forwarded_to_graylog ON profiling_data(forwarded_to_graylog, id)` for efficient FIFO replay
- **Query functions:**
  - `getUnforwardedRecords(limit)` - Fetch pending records ordered by ID
  - `markAsForwarded(rowId)` - Update record after successful GELF send
  - `getUnforwardedCount()` - Count pending records for monitoring
- **Insert modification:** Explicit `forwarded_to_graylog = 0` in INSERT statement for new records
- **Type safety:** Updated `ProfilingDataRow` interface with optional `forwarded_to_graylog` field

### Task 2: GELF Client Module
- **Dependencies:** Installed gelf-pro (1.4.0) and opossum (9.0.0) with @types/opossum
- **Client wrapper:** Created `listener/src/graylog/client.ts` with:
  - `initGelfClient()` - Configure TCP adapter with env vars (host, port, facility)
  - `sendGelfMessage(message)` - Promise-based wrapper around gelf-pro callback API
  - `isGraylogEnabled()` - Check if integration enabled and initialized
  - `getGraylogStatus()` - Health check status object
- **Configuration:** Added Graylog section to `.env.example`:
  - `GRAYLOG_ENABLED` (default: false) - Feature flag
  - `GRAYLOG_HOST` (default: 127.0.0.1)
  - `GRAYLOG_PORT` (default: 12201)
  - `GRAYLOG_FACILITY` (default: bitville-listener)
  - `BITVILLE_STATE_PATH` - Circuit breaker state persistence path
- **Safety:** Client silently skips operations when disabled (no errors)

## Technical Decisions

### Migration Strategy: Dual Default Pattern
**Challenge:** Need to prevent replay of historical pre-Phase 4 data while tracking new records.

**Solution:** ALTER TABLE uses DEFAULT 1 for existing rows (assume already sent), but INSERT statements use explicit 0 for new records after code deployment.

**Benefit:** Clean migration path without massive replay storm when Phase 4 activates.

### Composite Index for Replay Efficiency
**Pattern:** Index on `(forwarded_to_graylog, id)` instead of just `forwarded_to_graylog`.

**Rationale:** Replay query `WHERE forwarded_to_graylog = 0 ORDER BY id ASC LIMIT ?` can use index for both filtering and ordering (no separate sort).

**Impact:** Efficient FIFO replay with single index scan.

### GELF Client Disabled by Default
**Approach:** Opt-in activation via `GRAYLOG_ENABLED=true` environment variable.

**Rationale:**
- Allows Phase 4 code deployment without requiring Graylog server upfront
- Safe rollout: test database migration independently of Graylog connectivity
- Operations can verify database changes before enabling forwarding

**Trade-off:** Requires manual configuration step, but provides deployment safety.

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for Plan 04-02 (Forwarder Implementation):**
- ✅ Database tracking mechanism in place
- ✅ GELF client module available for forwarding
- ✅ Query functions for replay implemented
- ✅ Configuration structure defined

**Blockers:** None

**Concerns:** None - foundation solid for forwarder implementation

## Testing Performed

### Database Migration Test
```bash
BITVILLE_DB_PATH=./test-migration.db bun run test-migration.ts
```
**Results:**
- ✅ Column `forwarded_to_graylog` exists with CHECK constraint
- ✅ Index `idx_forwarded_to_graylog` created
- ✅ New inserts default to `forwarded_to_graylog = 0`
- ✅ `getUnforwardedRecords()` returns unforwarded records
- ✅ `markAsForwarded()` updates record correctly
- ✅ Unforwarded count decreases after marking

### GELF Client Test
```bash
bun run test-gelf-client.ts
```
**Results:**
- ✅ Client disabled by default (GRAYLOG_ENABLED=false)
- ✅ `initGelfClient()` returns false when disabled
- ✅ `sendGelfMessage()` silently skips when disabled
- ✅ `getGraylogStatus()` returns correct configuration
- ✅ TypeScript compilation successful

### Overall Verification
- ✅ `bun install` completes without errors
- ✅ gelf-pro and opossum packages installed
- ✅ TypeScript types resolve correctly
- ✅ No breaking changes to existing ingestion endpoints

## Git Commits

**Commit 1:** `41a6638` - feat(04-01): add forwarded_to_graylog column for GELF replay tracking
- Schema update with CHECK constraint
- Migration logic for existing tables
- Replay query functions
- Type updates

**Commit 2:** `51b99d6` - feat(04-01): add GELF client module for Graylog integration
- gelf-pro and opossum installation
- GELF client wrapper module
- Environment configuration
- Health check functions

## Requirements Satisfied

**GELF-01 (partial):** Foundation for GELF TCP transport to Graylog
- GELF client module created (forwarding logic in next plan)

**GELF-04 (partial):** Foundation for replay buffering during Graylog outages
- Database tracking column implemented (circuit breaker in next plan)

## Related Documentation

- **Phase 3 Plan 03-01:** Database schema foundation (extended with forwarding column)
- **Phase 4 CONTEXT.md:** Circuit breaker and forwarding strategy decisions
- **Phase 4 RESEARCH.md:** GELF protocol and gelf-pro library evaluation
