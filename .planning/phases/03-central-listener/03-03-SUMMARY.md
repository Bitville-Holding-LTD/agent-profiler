---
phase: 03-central-listener
plan: 03
subsystem: infra
tags: [croner, cleanup, retention, systemd, deployment, cron, vacuum]

# Dependency graph
requires:
  - phase: 03-02
    provides: HTTP server with database ingestion
provides:
  - 7-day retention policy with hourly cleanup cron job
  - Incremental vacuum for disk space reclamation
  - systemd service file with security hardening
  - Complete environment variable documentation
  - Manual cleanup endpoint for admin operations
affects: [07-deployment, 04-graylog-integration]

# Tech tracking
tech-stack:
  added: [croner@8.0.0]
  patterns: [cron-job-lifecycle, graceful-shutdown-with-cleanup, systemd-hardening]

key-files:
  created:
    - listener/src/database/cleanup.ts
    - listener/bitville-listener.service
    - listener/.env.example
    - listener/test-cleanup.ts
  modified:
    - listener/src/server.ts

key-decisions:
  - "Cleanup runs hourly at minute 0 with immediate execution on startup"
  - "7-day retention period (STOR-02 requirement)"
  - "Incremental vacuum reclaims up to 100 pages after each cleanup"
  - "Graceful shutdown with 5-second timeout for in-flight requests"
  - "Admin cleanup endpoint requires BITVILLE_ADMIN_ENABLED=true and API key"
  - "systemd security hardening: NoNewPrivileges, ProtectSystem, ProtectHome, PrivateTmp"

patterns-established:
  - "Cron job lifecycle: startCleanupJob, stopCleanupJob, runCleanupNow, getCleanupStatus"
  - "Cleanup status exposed in /ready endpoint for monitoring"
  - "Unified shutdown handler for SIGTERM and SIGINT"

# Metrics
duration: 3min 6sec
completed: 2026-01-27
---

# Phase 03 Plan 03: Retention Policy and Systemd Service Summary

**Hourly cleanup cron deletes 7-day old data with incremental vacuum, production systemd service with security hardening, and complete deployment configuration**

## Performance

- **Duration:** 3 min 6 sec
- **Started:** 2026-01-27T20:08:49Z
- **Completed:** 2026-01-27T20:11:55Z
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- Hourly cleanup job with croner deletes records older than 7 days (STOR-02)
- Incremental vacuum reclaims disk space after each cleanup (up to 100 pages)
- Production systemd service file with security hardening and restart policy
- Complete .env.example documenting all configuration options
- Manual cleanup endpoint for administrative operations (/admin/cleanup)
- Graceful shutdown integration stops cleanup job before database closure

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cleanup job with croner** - `1cc0629` (feat)
   - 7-day retention policy implementation
   - Hourly cron schedule (0 * * * *)
   - Immediate cleanup on startup
   - Incremental vacuum after deletions
   - Test verifies old records deleted, recent retained

2. **Task 2: Integrate cleanup into server lifecycle** - `eb5b592` (feat)
   - Start cleanup job on server startup
   - Add cleanup status to /ready endpoint
   - Unified shutdown handler with 5s timeout
   - Optional /admin/cleanup endpoint (requires BITVILLE_ADMIN_ENABLED=true)

3. **Task 3: Create systemd service and environment template** - `5e2a4eb` (feat)
   - Production systemd unit file
   - Security hardening (NoNewPrivileges, ProtectSystem, ProtectHome, PrivateTmp)
   - Restart policy with backoff (5s, max 3 in 60s)
   - Resource limits (65535 FDs, 512M memory)
   - Complete installation instructions in comments

## Files Created/Modified

### Created

- **listener/src/database/cleanup.ts** - Cleanup job module with croner scheduling
  - `runCleanupNow()` - Execute cleanup immediately, returns deleted count
  - `startCleanupJob()` - Start hourly cron (0 * * * *) with immediate first run
  - `stopCleanupJob()` - Stop cron for graceful shutdown
  - `getCleanupStatus()` - Return running state, next run time, retention days
  - Uses `deleteOldRecords()` from queries.ts with 7-day cutoff (604800 seconds)
  - Incremental vacuum after deletions to reclaim disk space

- **listener/bitville-listener.service** - systemd unit file
  - Type=simple with bitville user/group
  - ExecStart: `/home/bitville/.bun/bin/bun run /opt/bitville-listener/src/server.ts`
  - Restart=always with 5s delay, max 3 attempts in 60s
  - Security: NoNewPrivileges, PrivateTmp, ProtectSystem=strict, ProtectHome=true
  - Resource limits: 65535 file descriptors, 512M memory max
  - Journal logging with syslog identifier
  - Installation instructions in comments

- **listener/.env.example** - Environment variable template
  - BITVILLE_PORT (default: 8443)
  - BITVILLE_TLS_KEY_PATH, BITVILLE_TLS_CERT_PATH (optional HTTPS)
  - BITVILLE_DB_PATH (database location)
  - BITVILLE_API_KEY_* pattern (one per project)
  - BITVILLE_ADMIN_ENABLED (optional admin endpoints)
  - BITVILLE_LOG_LEVEL (optional logging configuration)

- **listener/test-cleanup.ts** - Cleanup verification test
  - Creates test database with old (8 days) and recent (1 day) records
  - Runs cleanup, verifies old records deleted (5), recent retained (3)

### Modified

- **listener/src/server.ts** - Integrated cleanup lifecycle
  - Import cleanup functions
  - Call `startCleanupJob()` after database initialization
  - Add cleanup status to /ready endpoint response
  - Unified shutdown handler calls `stopCleanupJob()` before database closure
  - 5-second timeout for in-flight requests during shutdown
  - Optional POST /admin/cleanup endpoint (requires BITVILLE_ADMIN_ENABLED=true and valid API key)

## Decisions Made

**1. Cleanup runs hourly at minute 0 with immediate startup execution**
- **Rationale:** Hourly frequency prevents disk exhaustion without excessive overhead. Immediate first run cleans any accumulated data from previous downtime.
- **Implementation:** Cron pattern "0 * * * *" runs at :00 of every hour. startCleanupJob() calls runCleanupNow() before scheduling.

**2. 7-day retention period (STOR-02 requirement)**
- **Rationale:** Requirement specifies 7-day retention for profiling data. Calculated as 604800 seconds (7 * 24 * 60 * 60).
- **Implementation:** RETENTION_SECONDS constant in cleanup.ts, cutoff = now - retention.

**3. Incremental vacuum reclaims up to 100 pages after cleanup**
- **Rationale:** Reclaim disk space without blocking operations. Incremental vacuum is non-blocking unlike full VACUUM.
- **Implementation:** `PRAGMA incremental_vacuum(100)` after deletions > 0. Gradual space reclamation over multiple runs.

**4. Graceful shutdown with 5-second timeout**
- **Rationale:** Allow in-flight HTTP requests to complete during restart (systemd, Kubernetes). Prevent data loss from aborted requests.
- **Implementation:** Unified shutdown() function: stop cleanup job → server.stop(false) → setTimeout(5000) → close database → exit.

**5. Admin cleanup endpoint requires BITVILLE_ADMIN_ENABLED=true**
- **Rationale:** Manual cleanup is administrative operation. Opt-in via environment variable prevents accidental exposure.
- **Implementation:** Check `Bun.env.BITVILLE_ADMIN_ENABLED === "true"` before enabling POST /admin/cleanup route. Requires valid API key authentication.

**6. systemd security hardening**
- **Rationale:** Defense in depth for production deployment. Minimize attack surface if listener is compromised.
- **Implementation:** NoNewPrivileges=true (no privilege escalation), ProtectSystem=strict (read-only /usr, /boot), ProtectHome=true (no home dirs), PrivateTmp=true (isolated /tmp).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - cleanup integration straightforward with existing database foundation from 03-01.

## Requirements Satisfied

- **STOR-02**: Data retention policy - 7 days for profiling data, automatic cleanup
- **DEPLOY-01** (partial): systemd service configuration for production deployment

## User Setup Required

**Production deployment:**

1. **Install Bun runtime:**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Create service user and directories:**
   ```bash
   sudo useradd -r -s /bin/false bitville
   sudo mkdir -p /opt/bitville-listener /var/lib/bitville /etc/bitville
   sudo cp -r listener/* /opt/bitville-listener/
   sudo chown -R bitville:bitville /opt/bitville-listener /var/lib/bitville
   ```

3. **Configure environment:**
   ```bash
   sudo cp listener/.env.example /etc/bitville/listener.env
   # Edit /etc/bitville/listener.env and set:
   # - BITVILLE_DB_PATH=/var/lib/bitville/listener.db
   # - BITVILLE_API_KEY_<PROJECT>=<openssl rand -hex 32>
   # - BITVILLE_PORT=8443
   # - BITVILLE_TLS_KEY_PATH, BITVILLE_TLS_CERT_PATH (if using HTTPS)
   ```

4. **Install and start service:**
   ```bash
   sudo cp listener/bitville-listener.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable bitville-listener
   sudo systemctl start bitville-listener
   sudo systemctl status bitville-listener
   ```

5. **Verify cleanup job:**
   ```bash
   curl http://localhost:8443/ready | jq '.cleanup'
   # Expected: {"running":true,"nextRun":"<ISO timestamp>","retentionDays":7}
   ```

**Optional admin features:**
```bash
# Enable manual cleanup endpoint
echo "BITVILLE_ADMIN_ENABLED=true" | sudo tee -a /etc/bitville/listener.env
sudo systemctl restart bitville-listener

# Trigger manual cleanup
curl -X POST -H "Authorization: Bearer <your-api-key>" http://localhost:8443/admin/cleanup
# Returns: {"deleted": <count>}
```

## Next Phase Readiness

**Ready for Phase 4 (Graylog Integration):**
- Central listener complete: database, HTTP ingestion, retention policy
- Data automatically cleaned after 7 days, disk space reclaimed
- Production deployment configured with systemd
- Health and readiness endpoints ready for monitoring

**Ready for Phase 7 (Deployment):**
- systemd service file production-ready
- Environment variable documentation complete
- Installation instructions tested
- Security hardening applied

**No blockers.** Phase 3 (Central Listener Data Reception & Storage) complete. All STOR requirements satisfied:
- STOR-01 (03-01): SQLite database with WAL mode
- STOR-02 (03-03): 7-day retention policy with automatic cleanup
- LIST-01 through LIST-04 (03-02): HTTP ingestion endpoints

---
*Phase: 03-central-listener*
*Completed: 2026-01-27*
