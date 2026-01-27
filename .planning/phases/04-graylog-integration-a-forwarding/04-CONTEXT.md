# Phase 4: Graylog Integration & Forwarding - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Forward all profiling data collected by the central listener to Graylog for long-term storage and analysis. Implements resilient integration with circuit breaker pattern, buffering during outages, and automatic replay when Graylog recovers. Does not modify data collection (Phase 3) or add new Graylog features.

</domain>

<decisions>
## Implementation Decisions

### Forwarding Strategy
- **Immediate forwarding:** Forward each profiling record to Graylog as soon as it's received and stored in SQLite
- **Asynchronous execution:** Ingestion endpoints return immediately after SQLite storage; forwarding happens in background
- **Event-driven triggers:** After each SQLite insert, trigger an async GELF forward task (no polling)
- **Circuit breaker interaction:** When circuit breaker is open, store data in SQLite only; skip forward attempt; data queued for replay when circuit closes

### Circuit Breaker Behavior
- **Detection method:** Consecutive failure counting (open after N failures in a row)
- **Failure threshold:** 5 consecutive failures (consistent with Phase 2 PHP agent circuit breaker)
- **Retry timeout:** 60 seconds (consistent with Phase 2 PHP agent)
- **State persistence:** Persist circuit breaker state to disk (survives listener restarts, prevents retry storm)

### Buffering and Replay
- **Tracking mechanism:** SQLite flag column (`forwarded_to_graylog` boolean) added to profiling_data table
- **Replay strategy:** FIFO (oldest first) when circuit breaker closes
- **Buffer limits:** No explicit limit on unforwarded records (7-day retention cleanup handles old data)
- **Throttling:** No rate limiting during replay (replay as fast as possible)

### GELF Field Mapping
- **Mapping approach:** Standard GELF fields for structure; everything else as custom underscore-prefixed fields
- **short_message:** Format as "source - project" (e.g., "php_agent - myproject")
- **full_message:** Complete profiling payload as JSON string
- **Custom fields extracted:**
  - Core: `_correlation_id`, `_project`, `_source`
  - Performance: `_duration_ms`, `_timestamp`
  - Request context: `_url`, `_method`, `_status_code` (when available in payload)

### Claude's Discretion
- GELF TCP connection configuration (timeouts, keepalive)
- Exact error handling for GELF serialization failures
- Logging and monitoring of forward success/failure
- Database migration strategy for adding `forwarded_to_graylog` column

</decisions>

<specifics>
## Specific Ideas

- Use graylog2/gelf-php 1.7.x library for PHP 7.4 compatibility (requirement GELF-02)
- Circuit breaker pattern should mirror Phase 2 PHP agent implementation (5 failures, 60s retry, disk persistence)
- Integration should not affect ingestion performance (async forwarding ensures fast response times)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-graylog-integration-a-forwarding*
*Context gathered: 2026-01-27*
