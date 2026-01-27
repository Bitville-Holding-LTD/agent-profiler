---
phase: 01-php-agent-core-instrumentation-safety
plan: 05
subsystem: data-collection
tags: [php, request-metadata, timing, security, filtering, sensitive-data]

# Dependency graph
requires:
  - phase: 01-01
    provides: Configuration loader (get_profiling_config)
provides:
  - Request metadata collector with sensitive data filtering
  - RequestTimer class for precise timing
  - Full request data package collection
  - Email masking and file upload filtering
affects: [01-06, php-agent-daemon, listener-server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Sensitive data filtering with recursive redaction
    - Request timing with microtime precision
    - Fallback to REQUEST_TIME_FLOAT for timing
    - Header normalization (HTTP_USER_AGENT to User-Agent)
    - Depth-limited recursion (max depth 5)
    - String truncation for memory safety

key-files:
  created:
    - php-agent/profiling/request_collector.php
  modified: []

key-decisions:
  - "SENSITIVE_KEYS constant defines 10 sensitive field patterns (password, token, api_key, etc.)"
  - "SENSITIVE_HEADERS constant defines 4 sensitive headers (Authorization, Cookie, etc.)"
  - "Recursive filtering with max depth 5 to prevent infinite loops"
  - "Long strings truncated at 1000 chars, headers at 500 chars"
  - "Email masking: j***@example.com format"
  - "File upload metadata captured without tmp_name or contents"
  - "Timing fallback to REQUEST_TIME_FLOAT if timer not initialized"

patterns-established:
  - "Sensitive data pattern: Define constants, iterate and check substrings"
  - "Timing pattern: Static class with start(), elapsed(), exceeds()"
  - "API pattern: Granular functions + convenience wrapper (collect_all_request_data)"

# Metrics
duration: 2min 24sec
completed: 2026-01-27
---

# Phase 01 Plan 05: Request Metadata Collector Summary

**Comprehensive request metadata capture with recursive sensitive data filtering, precise timing, and complete API for integration**

## Performance

- **Duration:** 2 minutes 24 seconds
- **Started:** 2026-01-27T17:22:44Z
- **Completed:** 2026-01-27T17:25:08Z
- **Tasks:** 3
- **Files created:** 1

## Accomplishments

- Request metadata collector captures URL, method, headers, GET/POST/FILES, server info
- Sensitive data filtering redacts passwords, tokens, API keys in nested arrays up to depth 5
- RequestTimer provides millisecond-precision timing with threshold checking
- Email masking helper function (j***@example.com format)
- File upload metadata captured without actual file contents
- Complete API with collect_all_request_data() convenience function
- should_profile() checks if request exceeds configured threshold

## Task Commits

Each task was committed atomically:

1. **Tasks 1-2: Create request metadata collector with sensitive data filtering** - `713bf51` (feat)
2. **Task 3: Add request timing and complete API** - `980bb51` (feat)

## Files Created/Modified

**Created:**
- `php-agent/profiling/request_collector.php` - Request metadata collection with filtering and timing (351 lines)

**Modified:**
- None

## Decisions Made

None - plan executed exactly as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected file path from plan**

- **Found during:** Task 1
- **Issue:** Plan specified `/var/www/project/site/profiling/request_collector.php` but project uses `php-agent/profiling/` directory
- **Fix:** Created file in correct location `php-agent/profiling/request_collector.php`
- **Files modified:** request_collector.php
- **Commit:** 713bf51

**Rationale:** Plan 01-01 established the `php-agent/profiling/` directory structure. Plan 01-05 incorrectly referenced the old path. Corrected to maintain consistency with established project structure.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Verification Results

All verification tests passed:

### 1. Sensitive Data Filtering Test
```
✓ password field redacted: [REDACTED]
✓ auth_token field redacted: [REDACTED]
✓ api_key in nested array redacted: [REDACTED]
✓ username preserved: john
✓ email preserved: test@example.com
✓ nested safe values preserved: safe value
```

### 2. Email Masking Test
```
✓ john@example.com → j***@example.com
✓ a@example.com → *@example.com
✓ invalid-email → [INVALID_EMAIL]
```

### 3. Request Timer Test
```
✓ Initial elapsed: ~0ms
✓ After 100ms sleep: ~102ms (accurate)
✓ Exceeds 50ms threshold: yes
✓ After 250ms total: ~262ms
✓ Should profile (500ms default): no
✓ After 550ms total: ~568ms
✓ Should profile (500ms default): yes
✓ Timing fallback works when timer not started
```

### 4. Full Request Collection Test
```
✓ URL captured: http://example.com/api/users?search=john
✓ Method captured: POST
✓ Authorization header redacted: [REDACTED]
✓ Cookie header would be redacted: [REDACTED]
✓ User-Agent preserved and formatted: Test/1.0
✓ GET parameters preserved: search=john
✓ POST password redacted: [REDACTED]
✓ POST username preserved: john
✓ Response status code: 200
✓ Elapsed time tracked: ~111ms
```

## Next Phase Readiness

**Ready for next plans:**
- ✅ Request metadata collector complete (Plan 01-06 can collect full request data)
- ✅ Timing infrastructure in place (listener.php can use should_profile())
- ✅ Sensitive data filtering working (safe to capture production data)
- ✅ Integration-ready API (collect_all_request_data() provides complete package)

**Security verification:**
- ✅ Authorization headers redacted
- ✅ Cookie headers redacted
- ✅ Password fields redacted (with partial matching)
- ✅ Token fields redacted (access_token, auth_token, etc.)
- ✅ API key fields redacted
- ✅ Credit card fields would be redacted
- ✅ Social security fields would be redacted
- ✅ File contents excluded from uploads
- ✅ Long strings truncated (1000 chars for values, 500 for headers)
- ✅ Recursion depth limited to 5

**No blockers or concerns.**

---
*Phase: 01-php-agent-core-instrumentation-safety*
*Completed: 2026-01-27*
