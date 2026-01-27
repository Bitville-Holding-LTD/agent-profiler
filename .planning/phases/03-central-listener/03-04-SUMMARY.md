---
phase: 03-central-listener
plan: 04
subsystem: network
tags: [udp, rate-limiting, bun, dgram, firewall]

# Dependency graph
requires:
  - phase: 03-01
    provides: Database layer with insertProfilingData function
  - phase: 03-02
    provides: HTTP server with validation schemas (PhpPayloadSchema, PostgresPayloadSchema)
provides:
  - UDP receiver for fire-and-forget ingestion on configurable port
  - Rate limiting middleware with sliding window (100 req/min per IP)
  - Dual-protocol server (HTTP + UDP) with unified database storage
  - X-Forwarded-For support for proxied rate limiting
affects: [04-graylog-integration, php-agent-transmission, postgres-agent]

# Tech tracking
tech-stack:
  added: [Bun.udpSocket, dgram (for testing)]
  patterns: [rate-limiting-middleware, sliding-window-algorithm, in-memory-tracking]

key-files:
  created:
    - listener/src/middleware/rate-limit.ts
    - listener/src/handlers/udp-receiver.ts
    - listener/test-rate-limit.ts
    - listener/test-udp.ts
    - listener/test-integration.ts
  modified:
    - listener/src/server.ts
    - listener/.env.example

key-decisions:
  - "UDP port 8444 (separate from HTTPS 8443)"
  - "No authentication on UDP (network firewall provides security)"
  - "Rate limiting: 100 requests/minute per IP address"
  - "In-memory rate limit tracking (simple Map)"
  - "Rate limit cleanup every 5 minutes (removes stale entries)"
  - "Rate limiting applied before authentication (prevents auth bypass attempts)"
  - "429 responses include Retry-After and X-RateLimit-* headers"

patterns-established:
  - "Pattern 1: Rate limiting via sliding window with in-memory Map storage"
  - "Pattern 2: UDP fire-and-forget with validation but no responses"
  - "Pattern 3: Dual-protocol server with unified database storage"

# Metrics
duration: 4min 37sec
completed: 2026-01-27
---

# Phase 3 Plan 4: UDP Receiver and Rate Limiting Summary

**UDP fire-and-forget ingestion with Bun.udpSocket and sliding window rate limiting (100 req/min) protecting HTTP endpoints**

## Performance

- **Duration:** 4 min 37 sec
- **Started:** 2026-01-27T20:14:45Z
- **Completed:** 2026-01-27T20:19:22Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- UDP receiver for high-throughput scenarios with validation but no authentication
- Rate limiting prevents abuse with 100 req/min per IP (configurable via env var)
- Dual-protocol server handles HTTP and UDP simultaneously with unified storage
- Graceful shutdown stops all services (HTTP, UDP, rate limit cleanup)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create rate limiting middleware** - `d328387` (feat)
2. **Task 2: Create UDP receiver** - `947b3d4` (feat)
3. **Task 3: Integrate rate limiting and UDP into server** - `9b77fec` (feat)

## Files Created/Modified
- `listener/src/middleware/rate-limit.ts` - Sliding window rate limiter with in-memory Map storage
- `listener/src/handlers/udp-receiver.ts` - UDP socket receiver with Zod validation
- `listener/src/server.ts` - Integrated rate limiting and UDP server lifecycle
- `listener/.env.example` - Documented BITVILLE_UDP_PORT and BITVILLE_RATE_LIMIT
- `listener/test-rate-limit.ts` - Test verifies 100 req limit and window reset
- `listener/test-udp.ts` - Test verifies UDP ingestion and error handling
- `listener/test-integration.ts` - Test verifies rate limiting + UDP together

## Decisions Made

1. **UDP port 8444 (separate from HTTPS 8443)**: Keep protocols on different ports for clarity and firewall rule simplicity

2. **No authentication on UDP**: UDP has no headers, intended for internal network where firewall provides security. HTTP remains authenticated.

3. **Rate limiting: 100 requests/minute per IP**: Prevents abuse without impacting normal usage. Configurable via BITVILLE_RATE_LIMIT env var.

4. **In-memory rate limit tracking**: Simple Map storage sufficient for single-instance deployment. Avoids database overhead.

5. **Rate limit cleanup every 5 minutes**: Removes stale entries (>2 minutes old) to prevent memory growth.

6. **Rate limiting before authentication**: Prevents authentication bypass attempts and protects auth middleware from DDoS.

7. **429 responses include RFC headers**: Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset provide client guidance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed as specified. UDP server integrated cleanly with existing HTTP server using Bun.serve + Bun.udpSocket.

## User Setup Required

None - no external service configuration required.

Configuration via environment variables:
- `BITVILLE_UDP_PORT=8444` - Enable UDP receiver (optional, disabled by default)
- `BITVILLE_RATE_LIMIT=100` - Adjust rate limit (optional, defaults to 100)

## Next Phase Readiness

**Ready for Phase 4 (Graylog Integration):** Central listener now accepts data via HTTP (authenticated) and UDP (firewalled). Rate limiting protects against abuse. Ready to forward data to Graylog.

**Capabilities delivered:**
- LIST-01: UDP protocol support for fire-and-forget scenarios
- Basic abuse prevention via rate limiting (research recommendation)
- Dual ingestion protocols with unified storage
- Production-ready server with graceful shutdown

**No blockers or concerns.**

---
*Phase: 03-central-listener*
*Completed: 2026-01-27*
