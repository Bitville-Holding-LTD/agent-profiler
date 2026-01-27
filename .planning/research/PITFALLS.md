# Pitfalls Research

**Domain:** APM and PHP Profiling Systems
**Researched:** 2026-01-27
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Observer Effect - Profiling Itself Causing Performance Degradation

**What goes wrong:**
The profiler introduces significant performance overhead that itself becomes a source of load spikes and latency increases. Over-instrumentation can add 15-20% latency to production requests. When profilers are enabled to investigate latency spikes, p99 latency drifts upward, CPU usage increases noticeably, and the profiler itself may cause the performance incidents you're trying to debug.

**Why it happens:**
PHP 7 is significantly faster than PHP 5.6, but profilers didn't get proportionally faster, leading to higher relative overhead. Hierarchical profilers (like XHProf in full trace mode) incur overhead on every function call. When enabling both CPU and memory profiling together, overhead compounds. Teams often instrument every function call manually, creating measurement noise and performance drag.

**How to avoid:**
- Use sampling profilers (like Excimer) that interrupt periodically rather than hooking every function call - overhead is measured in milliseconds instead of percentages
- For hierarchical profilers like XHProf, use whitelist-profiling mode to only instrument critical functions (5-40% overhead vs. full traces)
- Implement adaptive sampling: start with 1-10% sampling rate, only increase for specific investigations
- Use wall-time-only profiling for always-on production monitoring (minimal overhead)
- Set strict overhead budgets: if profiling adds >50ms to request time, skip profiling for that request
- Monitor the monitor: track profiler CPU usage and memory consumption as separate metrics

**Warning signs:**
- P99 latency increases when profiler is enabled
- CPU usage jumps 10-20% when profiling is active
- Memory usage grows faster than traffic volume
- Profiling data shows the profiler itself in top time consumers
- Production alerts fire when you enable profiling

**Phase to address:**
Phase 1: Core Instrumentation - Build overhead budgeting and circuit breaker into initial agent design. Must be foundational, not retrofitted.

**Specific to PHP 7.4:**
PHP 7.4 doesn't have JIT (added in PHP 8.0), so profiling overhead is relatively higher. The Zend Engine function call hooks used by XHProf are slower on PHP 7+ than PHP 5.6. Consider sampling profilers like Excimer which bypass function hooks entirely.

---

### Pitfall 2: Memory Leaks in Long-Running Daemon Processes

**What goes wrong:**
Agent daemons accumulate memory over time until they exhaust available RAM and crash or get killed by the OS. A small 1MB leak per request multiplied by 10,000 requests equals 10GB lost. Memory leaks escalate from being a minor blip to taking down entire servers in long-running scripts. Resource descriptors (file handles, socket connections) are limited to 2^32-1 in PHP 5.5+ and cannot be reused - once opened, closing them doesn't return them to the available pool.

**Why it happens:**
PHP is designed for short-lived request-response cycles where each request dies and releases all memory automatically. PHP's design: request comes in, process, respond, die, memory freed. Long-running daemon processes don't have this natural cleanup point. Circular references in objects aren't garbage collected without explicit gc_collect_cycles() calls. Unoptimized ORM queries load 100,000 records, spiking memory from 40MB to 360MB, and memory never comes back down. Event listeners, database connections, and cached objects accumulate across thousands of requests.

**How to avoid:**
- Implement worker restart policies: limit each daemon to processing 100-1,000 requests before graceful shutdown and respawn
- Use supervisord or systemd to automatically respawn crashed/stopped workers
- Monitor memory usage per worker as a stopping condition: exit gracefully when memory exceeds threshold (e.g., 256MB)
- Enable garbage collection for daemons: gc_enable() and periodic gc_collect_cycles()
- Explicitly unset large variables after use: unset($large_array)
- Use memory_get_usage(true) to track real memory allocation, not just reported usage
- Profile memory with tools like php-memory-profiler to identify leak sources
- Avoid static variables in long-running contexts - they persist indefinitely
- Close database connections, file handles, and sockets explicitly

**Warning signs:**
- Memory usage increases linearly with uptime, never stabilizing
- Worker processes show 200MB+ memory after processing 10K requests
- Out of memory errors in daemon logs
- System shows high swap usage
- Top shows PHP daemons with VSZ growing continuously
- Resource descriptor exhaustion errors (too many open files)

**Phase to address:**
Phase 2: Daemon Architecture - Worker lifecycle management must be designed early. Memory monitoring and restart policies are architectural decisions, not add-ons.

**Specific to daemon architecture:**
Your 50ms timeout pattern helps but doesn't prevent memory accumulation. The daemon will keep running after timeout, continuing to leak. Implement explicit memory thresholds: if memory_get_usage(true) > 256MB, schedule graceful shutdown after current request completes.

---

### Pitfall 3: Blocking I/O in the Request Path Causing Application Failures

**What goes wrong:**
Profiling agents send data to listeners synchronously during request processing. When the listener is slow, overloaded, or unreachable, the blocking socket write stalls the PHP application, causing request timeouts and application failures. Your "must NEVER cause application failures" requirement is directly violated. Users experience 504 Gateway Timeouts while the profiler waits for a socket write to complete.

**Why it happens:**
Default socket operations in PHP are synchronous/blocking. socket_write() and fwrite() on TCP sockets wait for the data to be sent or timeout. If the listener daemon is processing a large batch or has a full buffer, the write blocks. Network congestion, listener crashes, or high data volume all cause backpressure that propagates to the application request thread. Developers test with local sockets on low-latency networks where blocking is imperceptible, then deploy to production where network latency and data volume expose the issue.

**How to avoid:**
- Use non-blocking sockets: socket_set_nonblock() or stream_set_blocking($socket, false)
- Implement send timeouts at the socket level: socket_set_option($socket, SOL_SOCKET, SO_SNDTIMEO, ['sec' => 0, 'usec' => 50000]) for 50ms
- Use async write patterns: queue data to local memory buffer, separate thread/process sends to listener
- Implement circuit breaker: after 3 consecutive send failures, stop attempting for 60 seconds
- Use Unix domain sockets instead of TCP for local communication - faster and more reliable
- Fallback to file-based buffering: if socket write fails, append to local log file for later collection
- Never use synchronous HTTP calls in request path - always use fire-and-forget UDP or local sockets
- Test under failure conditions: kill listener daemon and verify application remains functional

**How to avoid (continued):**
- Implement batching with timeouts: collect data locally, flush batch every 5 seconds OR when buffer reaches 100 entries, whichever comes first
- Use SO_TIMEOUT socket option to enforce hard write deadlines
- Monitor blocking wait times: track time spent in socket writes, alert if >10ms

**Warning signs:**
- Application response times correlate with listener daemon load
- Increased 504/timeout errors when profiling data volume is high
- strace shows sendto() system calls taking >50ms
- Application threads stuck in write() syscalls (visible in thread dumps)
- Listener restarts cause spike in application errors
- Top shows processes in "D" state (uninterruptible sleep, usually I/O)

**Phase to address:**
Phase 1: Core Instrumentation - Non-blocking I/O and circuit breakers must be in the initial implementation. This is a safety requirement, not an optimization.

**Specific to your architecture:**
Your 50ms timeout is correct but must be enforced at the socket level, not just application level. Use stream_set_timeout() or socket_set_option() with SO_SNDTIMEO/SO_RCVTIMEO. Test explicitly: kill listener daemon, verify PHP app continues without errors or delays.

---

### Pitfall 4: Data Volume Overwhelming the Listener (Backpressure Cascade)

**What goes wrong:**
High-traffic applications generate profiling data faster than the listener can process it. The listener's receive buffer fills up, causing socket writes from PHP agents to block or fail. This creates backpressure that cascades to the application, causing slowdowns or dropped profiling data. During load spikes (the exact events you want to profile), the APM system becomes unusable because it's overwhelmed by the volume.

**Why it happens:**
Sampling rate is set too high (e.g., 100% profiling) without considering throughput. A service handling 1,000 req/s with 10KB profiling data per request generates 10MB/s = 36GB/hour. The listener daemon is single-threaded or poorly optimized, unable to process data at the arrival rate. TCP socket buffers (SO_RCVBUF/SO_SNDBUF) are too small to absorb bursts. No backpressure signaling: agents keep sending data even when listener is drowning.

**How to avoid:**
- Implement adaptive sampling: target 10 traces/second per agent by default (Datadog's approach)
- Use head-based sampling: make sample/skip decision at trace start, not after collection
- Configure socket buffers larger: SO_RCVBUF=256KB, SO_SNDBUF=256KB to handle bursts
- Implement rate limiting at agent: max 100 traces/second, drop excess (don't block)
- Use tail-based sampling for error/slow traces: always capture errors and >1s requests unsampled
- Listener should process data async: write to disk/database in background, ACK immediately to agent
- Monitor queue depth: if listener's internal queue exceeds 1,000 items, increase sampling threshold
- Scale listeners horizontally: multiple listener daemons, agents round-robin between them
- Compress data: gzip compress profiling payloads before sending (5-10x size reduction)

**Warning signs:**
- Listener CPU at 100% during traffic spikes
- Listener memory growing unbounded
- Agent send failures increase with traffic volume
- Socket buffer overflow errors in dmesg
- Profiling data has gaps during high-traffic periods
- Listener can't keep up: netstat shows large Recv-Q for listener socket

**Phase to address:**
Phase 3: Data Collection Pipeline - Must design for volume from the start. Sampling, buffering, and backpressure handling are core architectural decisions.

**Specific to your scenario:**
Load spikes are your investigation target, so the system must remain functional during spikes. Implement: (1) Adaptive sampling: increase sampling threshold during high traffic. (2) Prioritize slow requests: always profile requests >500ms, sample others at 1%. (3) Tail-based for errors: any request with error status is profiled 100%.

---

### Pitfall 5: Trace Correlation Failure Between PHP Application and Database Queries

**What goes wrong:**
Profiling data shows application time and database query logs separately, but you cannot connect which queries belong to which requests. Root cause analysis fails because you can see a slow request and you can see slow queries, but you don't know which query caused which slowdown. The correlation ID is lost, mismatched, or never propagated. This makes the APM system nearly useless for debugging database-related performance issues.

**Why it happens:**
PHP application generates trace IDs, but Postgres queries don't include them in pg_stat_statements or logs. Multiple database connections from connection pooling make correlation by timestamp unreliable (10 concurrent requests to same DB). Async queries or transaction boundaries break the 1:1 request-to-query mapping. Application trace uses one ID format, database logs use another, no translation layer. Timestamps have millisecond precision but queries complete in microseconds, causing ambiguity.

**How to avoid:**
- Inject trace context into SQL as comments: `/* trace_id=abc123 */ SELECT * FROM users`
- Enable Postgres logging with trace IDs: log_line_prefix = '%t [%p] trace_id=%a'
- Use application_name connection parameter to pass trace ID: set application_name = 'trace:abc123'
- Tag queries in pg_stat_statements with application_name or query comments for correlation
- Implement W3C Trace Context standard for propagation (traceparent header)
- Use correlation tables: write (trace_id, query_hash, timestamp) to shared memory or fast KV store
- Wrap all PDO/mysqli calls to automatically inject trace context
- For connection pools, use per-request connection tagging, not per-connection
- Log trace ID at start of transaction, correlate all queries within transaction boundary

**Warning signs:**
- Cannot link slow queries in Postgres logs to specific PHP requests
- Timestamp-based correlation shows multiple possible matches
- Root cause analysis requires manual log grepping and guesswork
- Database dashboard and APM dashboard show different "slow queries"
- Missing query details in APM traces (just "database time: 500ms" without query text)

**Phase to address:**
Phase 4: Query Instrumentation - Correlation mechanism must be designed when instrumenting database calls. Retrofitting is painful and may require schema changes.

**Specific to Postgres:**
Use application_name as primary correlation mechanism: `pg_connect("... application_name='trace:$trace_id'")`. Enable log_line_prefix = '%a %t [%p]:' to include application_name in logs. Query pg_stat_activity to correlate active queries to trace IDs in real-time.

---

### Pitfall 6: Production Safety Violated - Profiler Crashes or Hangs Application

**What goes wrong:**
Despite best intentions, the profiling agent triggers a segfault, infinite loop, or deadlock in the PHP application, causing production outages. A bug in the profiler extension causes PHP-FPM workers to crash. An edge case in the instrumentation code triggers a fatal error during request processing. Your "must NEVER cause application failures" promise is broken, causing loss of user trust and potential revenue impact.

**Why it happens:**
PHP profiling extensions (XHProf, Tideways, custom extensions) are written in C and run in the same process space as the application. Memory safety errors (buffer overflows, use-after-free) in C code cause segfaults. Exception handling in profiler code doesn't account for all PHP error conditions. Signal handlers interfere with PHP's internal signal handling. Profiler modifies PHP's internal state (call stack, symbol tables) in unsafe ways. Insufficient testing under production load patterns and edge cases.

**How to avoid:**
- Run profiler in separate process space: agent daemon outside PHP-FPM, communicate via IPC
- Use exception handling around all instrumentation code: catch Throwable, never let exceptions propagate
- Implement watchdog timeout: if profiling code runs >50ms, kill it and skip profiling for this request
- Use register_shutdown_function() to log profiler errors without affecting request response
- Test with fuzzing: send malformed data, edge cases, extreme loads to profiler
- Gradual rollout: profile 0.1% of traffic, then 1%, then 10%, monitoring error rates at each step
- Circuit breaker: if error rate increases >0.1% when profiler is enabled, auto-disable
- Separate profiler-enabled and profiler-disabled instance pools: canary deploy profiling changes
- Use xdebug.remote_enable = 0 and disable all debugging extensions in production

**How to avoid (continued):**
- Memory safety: use AddressSanitizer and Valgrind during development to catch C-level issues
- Never use eval() or dynamic code generation in profiler code
- Log profiler errors to separate file: don't use application's error handler
- Implement "silent failure": if profiler hits error, log it but complete request successfully

**Warning signs:**
- Increased PHP-FPM worker crash rate when profiler is enabled
- Segfaults in error logs: "signal 11 (SIGSEGV)"
- PHP-FPM slow log shows requests stuck in profiler code
- Requests timeout only when profiler is active
- Error rate increases correlated with profiler deployment
- Core dumps generated by PHP processes

**Phase to address:**
Phase 1: Core Instrumentation - Safety mechanisms must be foundational. Build profiler as separate process from day one, not as PHP extension in application process.

**Specific to your architecture:**
Your daemon architecture is correct - agents run as separate processes. Ensure communication is via non-blocking IPC. If agent daemon crashes, PHP app continues unaffected. Use Unix domain sockets with 50ms timeout and error handling that logs failure but completes request.

---

### Pitfall 7: PHP 7.4 Legacy Compatibility Issues and Maintenance Burden

**What goes wrong:**
Profiling libraries and tools don't support PHP 7.4, forcing use of outdated and unmaintained tooling. Security vulnerabilities in PHP 7.4 (EOL November 2022) remain unpatched, creating compliance risks. Modern APM vendors drop PHP 7.4 support, making commercial solutions unavailable. Extensions compiled for PHP 7.4 break when testing on newer PHP versions, creating upgrade blockers.

**Why it happens:**
PHP 7.4 reached end-of-life in November 2022, and community support ended. In 2026, continuing to use PHP 7.4 exposes systems to vulnerabilities and compliance risks. Most profiling tool maintainers focus on PHP 8.0+ and don't backport features or fixes to PHP 7.4. The original XHProf extension didn't support PHP 7 well initially, requiring forks like Tideways' version. Legacy PHP applications lack type declarations, automated tests, and modern tooling, making profiler integration difficult.

**How to avoid:**
- Use Zend's Extended PHP Support (available through December 2026) for security patches
- Prefer pure PHP profiling solutions over C extensions: easier to maintain across versions
- Choose profiling tools explicitly compatible with PHP 7.4: Tideways XHProf v5.x (requires PHP >= 7.0)
- Plan PHP upgrade path: document profiler as one of many upgrade blockers
- Containerize with specific PHP 7.4.33 version to ensure reproducibility
- Test profiler against PHP 8.0+ in parallel: verify it won't block future upgrades
- Use composer.json to lock profiling library versions known to work with PHP 7.4
- Implement feature flags: build profiler to work with 7.4 but design for 8.x compatibility

**Warning signs:**
- Profiling libraries require PHP 8.0+ (composer dependency conflicts)
- Security scanner flags known PHP 7.4 CVEs
- Profiler C extension segfaults on PHP 7.4 but works on 8.0
- Vendor support says "upgrade to PHP 8" as solution to bug reports
- PHPCompatibility reports 100+ issues when checking against PHP 8

**Phase to address:**
Phase 1: Core Instrumentation - Technology selection phase. Choose profiling approach compatible with PHP 7.4 but upgradeable to PHP 8+.

**Specific to PHP 7.4.33:**
Excimer (Wikimedia's sampling profiler) supports PHP 7.2+ including 7.4. Tideways XHProf extension v5.x supports PHP 7.0+. Avoid tools requiring PHP 8.0+. Test on PHP 8.0 in CI to ensure upgrade path exists.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Profile 100% of requests | Complete data coverage | Massive performance overhead, volume overwhelms system | Never in production; only in dev/staging |
| Store full stack traces for every span | Maximum debugging detail | Storage explodes (GB/hour), queries become slow | Only for errors and high-latency requests (>1s) |
| Synchronous socket writes in request path | Simple implementation | Application failures when listener is slow/down | Never; always use non-blocking with timeout |
| Single-threaded listener daemon | Easy to write, no concurrency bugs | Cannot keep up with traffic, becomes bottleneck | Acceptable for MVP with <100 req/s |
| Timestamp-only correlation between app and DB | No code changes needed | Correlation fails under concurrency, wrong results | Only for single-threaded dev environment |
| Disable garbage collection for "performance" | Slightly lower CPU usage | Memory leaks in long-running daemons, crashes | Never in daemons; only in short-lived scripts |
| Manual instrumentation of every function | Complete control, no magic | Maintenance nightmare, 15-20% overhead | Only for critical hot paths (<10 functions) |
| File-based data transfer (agent writes file, listener reads) | No socket programming needed | Race conditions, file descriptor leaks, slower | Acceptable for prototyping, not production |
| Use XDebug profiler in production | Detailed function traces | 10x+ performance overhead, entire site unusable | Never; XDebug is for development only |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Postgres query tracking | Rely on timestamps for correlation | Inject trace IDs via application_name or SQL comments |
| Socket communication | Use blocking sockets with no timeout | Non-blocking sockets with SO_SNDTIMEO=50ms |
| Error logging | Profiler errors go to application error log | Separate error log for profiler, don't pollute app logs |
| Database connection pooling | Use one connection for all requests | Tag each connection with trace ID per request |
| External APM services (Datadog, New Relic) | Send every data point | Implement client-side sampling and aggregation |
| Systemd/supervisord integration | No graceful shutdown handling | Catch SIGTERM, finish current request, clean up |
| Memory profiling | Call memory_get_usage() without true parameter | Use memory_get_usage(true) for actual system allocation |
| Unix domain sockets | Assume socket file exists and is writable | Check file permissions, handle ENOENT gracefully |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Store all trace data in memory before sending | Fast for small traces | Out of memory errors | >1MB trace or >100 concurrent traces |
| Serialize PHP objects for transmission | Convenient, includes all context | CPU spike from serialization | >100 objects or deeply nested structures |
| Single listener daemon for all servers | Simple architecture | CPU bottleneck, cannot scale | >1,000 req/s aggregate |
| Collect all function calls in call graph | Complete visibility | 15-20% overhead, huge data volume | >1,000 function calls per request |
| String concatenation for large payloads | Simple code | Memory pressure, slow | >10KB payload with 100s of concatenations |
| Database insert per trace span | Simple, immediate durability | Database becomes bottleneck | >100 spans/sec |
| JSON encode entire trace at once | Simple | Memory spike and CPU cost | >10,000 spans in trace |
| No sampling, collect everything | "We might need it" | Volume overwhelms storage and query | >100 req/s with 100+ spans each |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Expose profiling endpoints without authentication | Anyone can see application internals, queries, secrets | Require authentication token, IP whitelist |
| Include sensitive data in traces (passwords, tokens) | Secrets leak into logs and APM dashboards | Scrub sensitive fields before sending |
| Allow external control of sampling rate | Attacker sets 100% sampling, causes DoS | Hardcode max sampling rate (10%), ignore external input |
| Run listener daemon as root | Privilege escalation if compromised | Run as dedicated user with minimal permissions |
| Store unencrypted traces on disk | Breach exposes all application data | Encrypt at rest or store only in memory/secure DB |
| No rate limiting on profiling API | Attacker floods system with fake traces | Rate limit by IP, require valid trace structure |
| SQL queries with sensitive data in trace spans | PII/credentials visible in APM UI | Parameterize queries, mask sensitive values |
| Profiler has write access to application code | Bug or exploit allows code injection | Read-only access, separate filesystem namespace |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Show every span in trace waterfall | Overwhelming, can't find signal in noise | Aggregate/collapse spans <10ms, highlight slow ones |
| No indication of sampling | Users think data is missing or system is broken | Display sampling rate on dashboard (e.g., "10% of requests") |
| Timestamps without timezone | Confusion when debugging across regions | Always use UTC with explicit timezone label |
| Query text without parameters | Cannot reproduce or understand query | Include query + parameters (sanitized) |
| Error traces look same as successful traces | Users miss critical errors in list | Visual indicator: red for errors, green for success |
| No link from APM to application logs | Users manually search logs with timestamps | Include log correlation link in trace UI |
| Latency shown in microseconds | Unintuitive (is 50000µs good or bad?) | Use ms for <1s, seconds for ≥1s |
| Trace list sorted by timestamp only | Cannot find slow or error traces | Default sort by duration desc, add error filter |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Profiling Agent:** Often missing graceful shutdown handling - verify handles SIGTERM and finishes current batch before exit
- [ ] **Database Correlation:** Often missing trace ID injection - verify SQL comments or application_name includes trace context
- [ ] **Socket Communication:** Often missing non-blocking mode - verify socket_set_nonblock() or stream_set_blocking(false) called
- [ ] **Error Handling:** Often missing profiler-specific error log - verify errors don't pollute application error log
- [ ] **Memory Management:** Often missing garbage collection - verify gc_enable() and periodic gc_collect_cycles() in daemons
- [ ] **Sampling Logic:** Often missing adaptive sampling - verify sampling rate adjusts based on traffic volume
- [ ] **Circuit Breaker:** Often missing failure detection - verify profiler auto-disables after N consecutive send failures
- [ ] **Overhead Budget:** Often missing performance monitoring - verify profiler tracks its own CPU/memory usage
- [ ] **Worker Restart:** Often missing memory-based restart - verify daemon exits gracefully when memory exceeds threshold
- [ ] **Timeout Enforcement:** Often missing socket-level timeout - verify SO_SNDTIMEO set, not just application-level timeout
- [ ] **Backpressure Handling:** Often missing queue depth monitoring - verify listener drops data when queue is full (doesn't block)
- [ ] **Production Testing:** Often missing chaos testing - verify killing listener daemon doesn't affect application
- [ ] **Trace Context Propagation:** Often missing standardization - verify W3C Trace Context format used across services
- [ ] **Sensitive Data Scrubbing:** Often missing sanitization - verify passwords, tokens, and PII removed from traces

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Observer effect causing load spikes | LOW | Disable profiler immediately, investigate sample set too high, reduce sampling rate to 1%, re-enable gradually |
| Memory leak crashing daemons | LOW | Restart daemons (automated by supervisor), implement memory threshold checks, add gc_collect_cycles() calls |
| Blocking I/O causing app failures | MEDIUM | Kill listener daemon to unblock agents, switch to non-blocking sockets, add circuit breaker |
| Data volume overwhelming listener | MEDIUM | Reduce sampling rate to 0.1%, scale listener horizontally, add compression, implement head-based sampling |
| Lost trace correlation | MEDIUM | Rebuild correlation via timestamps (lossy), implement SQL comment injection, redeploy with application_name tagging |
| Profiler crashes application | HIGH | Disable profiler in production immediately, rollback deployment, isolate profiler to canary instances, debug with AddressSanitizer |
| PHP 7.4 incompatibility | HIGH | Fork library and backport, switch to alternative tool, consider emergency PHP 8 upgrade |
| Storage exhaustion from trace data | MEDIUM | Delete old traces, implement TTL (7-day retention), add sampling, compress data |
| Trace ID collision | LOW | Regenerate IDs with better entropy (UUID v4), add timestamp prefix to ensure uniqueness |
| Listener daemon crash | LOW | Supervisor restarts automatically, agents queue to memory buffer, replay failed sends |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Observer effect overhead | Phase 1: Core Instrumentation | Load test: <50ms overhead at p99, no overhead increase under load |
| Memory leaks in daemons | Phase 2: Daemon Architecture | 48-hour daemon runtime test: memory stable <256MB |
| Blocking I/O failures | Phase 1: Core Instrumentation | Chaos test: kill listener, verify app continues normally |
| Data volume overwhelming | Phase 3: Data Collection Pipeline | Load test: 10,000 req/s with 1% sampling = stable listener CPU |
| Trace correlation failure | Phase 4: Query Instrumentation | Verify: pick random trace, find matching queries in pg_stat_statements |
| Production safety violation | Phase 1: Core Instrumentation | Error injection test: profiler crashes don't affect app |
| PHP 7.4 incompatibility | Phase 1: Core Instrumentation | Verify: tools work on PHP 7.4.33, test on PHP 8.0 in CI |
| Socket reliability | Phase 2: Daemon Architecture | Test: network partition between agent and listener, no app impact |
| Sampling strategy scaling | Phase 3: Data Collection Pipeline | Traffic spike test: 10x load, sampling adapts, no data loss |
| Security exposure | Phase 5: Security & Access Control | Audit: no secrets in traces, authentication required for endpoints |

## Sources

**APM Performance Overhead:**
- [Stackify: Mistakes Implementing APM Solutions](https://stackify.com/mistakes-implementing-application-performance-monitoring-solutions/)
- [Elastic Blog: APM Best Practices](https://www.elastic.co/blog/apm-best-practices)
- [DEV Community: Top 9 Mistakes to Avoid in APM](https://dev.to/quinnox_/top-9-mistakes-to-avoid-in-application-performance-monitoring-apm-420k)
- [Atatus: APM Guide 2026](https://www.atatus.com/blog/application-performance-monitoring/)
- [Medium: Profiling in Production Without Killing Performance (eBPF, Jan 2026)](https://medium.com/@yashbatra11111/profiling-in-production-without-killing-performance-ebpf-continuous-profiling-5a92a8610769)

**PHP Memory Leaks & Daemon Processes:**
- [Scout APM: PHP Memory Leaks, How to Find and Fix Them](https://www.scoutapm.com/blog/php-memory-leaks-how-to-find-and-fix-them)
- [Atatus: PHP Memory Leaks Developer Guide](https://www.atatus.com/blog/php-memory-leaks-apm-guide/)
- [GitHub: reli-prof - Sampling profiler for PHP](https://github.com/reliforp/reli-prof)
- [Daniel Persson: Find Memory Leaks and PHP bottlenecks](https://danielpersson.dev/2025/03/03/find-memory-leaks-and-php-bottlenecks-with-profiling-tools/)
- [Medium: Debugging Memory Leaks in Long-Running Symfony Applications (Jan 2026)](https://medium.com/@laurentmn/debugging-memory-leaks-in-long-running-symfony-applications-d2e89b17a53d)
- [Medium: The memory pattern every PHP developer should know (Nov 2025)](https://butschster.medium.com/the-memory-pattern-every-php-developer-should-know-about-long-running-processes-d3a03b87271c)
- [DEFINITIVELY NOT JAMES: The Problems with Long Running PHP scripts](https://notjam.es/blog/the-problems-with-long-running-php/)

**I/O Profiling & Performance:**
- [Computer, Enhance!: Instrumentation-Based Profiling](https://www.computerenhance.com/p/instrumentation-based-profiling)
- [jsaxton.com: Profiling I/O-Bound Applications](https://jsaxton.com/profiling-io-bound-applications/)
- [SigNoz: Java Profiling Guide (transferable concepts)](https://signoz.io/guides/java-application-profiling/)
- [Sentry Docs: Profiling](https://docs.sentry.io/product/explore/profiling/)

**Distributed Tracing & Correlation:**
- [Middleware.io: Root Cause Analysis in Distributed Systems](https://middleware.io/blog/identify-root-cause-analysis/)
- [Medium: Distributed Tracing & Root Cause Analysis Deep Dive](https://medium.com/@lahirukavikara/distributed-tracing-root-cause-analysis-deep-dive-caae4cd5f88c)
- [Groundcover: Distributed Tracing Logs](https://www.groundcover.com/learn/logging/distributed-tracing-logs)
- [New Relic: Distributed Tracing Guide](https://newrelic.com/blog/apm/distributed-tracing-guide)
- [Elastic: Root Cause Analysis Comprehensive Guide](https://www.elastic.co/what-is/root-cause-analysis)
- [Checkly Docs: Root Cause with Traces](https://www.checklyhq.com/docs/learn/incidents/root-cause-with-traces/)
- [arXiv: Tracing and Metrics Design Patterns for Cloud-native Applications](https://arxiv.org/html/2510.02991v1)

**PHP 7.4 Legacy & Profiling:**
- [TuxCare: PHP 7.4 EOL Navigating Legacy System Challenges](https://tuxcare.com/blog/php-7-4-eol-navigating-legacy-system-challenges/)
- [Security Boulevard: PHP 7.4 EOL](https://securityboulevard.com/2024/03/php-7-4-eol-navigating-legacy-system-challenges/)
- [Zend: Extended PHP Support for PHP 7.2-8.1](https://www.zend.com/services/php-long-term-support)
- [PHP.Watch: How to extend lifetime of legacy PHP applications](https://php.watch/articles/extend-lifetime-legacy-php)

**Socket Communication & IPC:**
- [GeeksforGeeks: Advantages of Unix Sockets for IPC](https://www.geeksforgeeks.org/linux-unix/advantages-of-unix-sockets-for-ipc/)
- [DEV Community: Understanding Unix Sockets Deep Dive](https://dev.to/prezaei/understanding-unix-sockets-a-deep-dive-into-inter-process-communication-47f7)
- [TutorialsPoint: IPC Problems in Distributed Systems](https://www.tutorialspoint.com/ipc-problems-caused-by-message-passing-in-a-distributed-system)
- [Chris Woodruff: Error Handling and Graceful Shutdowns in Socket Programming](https://woodruff.dev/error-handling-and-graceful-shutdowns-in-socket-programming/)
- [Opensource.com: Inter-process communication in Linux](https://opensource.com/article/19/4/interprocess-communication-linux-networking)
- [GeeksforGeeks: Handling Failure in Distributed Systems](https://www.geeksforgeeks.org/handling-failure-in-distributed-system/)

**APM Data Volume & Sampling:**
- [Datadog: Trace Sampling Use Cases](https://docs.datadoghq.com/tracing/guide/ingestion_sampling_use_cases/)
- [Elastic: Transaction Sampling](https://www.elastic.co/docs/solutions/observability/apm/transaction-sampling)
- [Datadog: Ingestion Volume Control](https://docs.datadoghq.com/tracing/guide/trace_ingestion_volume_control/)
- [New Relic: Event Limits and Sampling](https://docs.newrelic.com/docs/data-apis/understand-data/event-data/new-relic-event-limits-sampling/)
- [Honeybadger: The APM Paradox](https://www.honeybadger.io/blog/apm-paradox/)
- [Datadog: Adaptive Sampling](https://docs.datadoghq.com/tracing/trace_pipeline/adaptive_sampling/)

**PHP Profiling Tools (XHProf, Tideways):**
- [PHP Manual: XHProf](https://www.php.net/manual/en/book.xhprof.php)
- [Tideways: XHProf for PHP7 and PHP8](https://tideways.com/profiler/xhprof-for-php7)
- [Tideways: The 6 Best PHP Profilers](https://tideways.com/the-6-best-php-profilers)
- [Tideways: Profiling Overhead and PHP 7](https://tideways.com/profiler/blog/profiling-overhead-and-php-7)
- [Tideways: Improving XHProf Further](https://tideways.com/profiler/blog/improving-xhprof-further)
- [Wikimedia TechBlog: Profiling PHP in Production at Scale](https://techblog.wikimedia.org/2021/03/03/profiling-php-in-production-at-scale/)
- [Sandro Keil: PHP Profiling Tools Comparison](https://sandro-keil.de/blog/php-profiling-tools/)

**Database Query Correlation:**
- [SigNoz: Distributed Tracing Tools for Microservices 2026](https://signoz.io/blog/distributed-tracing-tools/)
- [Elastic Observability Labs: Continuous Profiling and Distributed Tracing Correlation](https://www.elastic.co/observability-labs/blog/continuous-profiling-distributed-tracing-correlation)
- [Dash0: Best Distributed Tracing Tools 2026](https://www.dash0.com/comparisons/best-distributed-tracing-tools)
- [Microsoft: Application Profiling Considerations](https://learn.microsoft.com/en-us/azure/well-architected/scalability/monitor-application)
- [MSSQLTips: Correlating Performance Monitor and SQL Server Profiler Data](https://www.mssqltips.com/sqlservertip/1212/correlating-performance-monitor-and-sql-server-profiler-data/)
- [Grafana: How Profiling and Tracing Work Together](https://grafana.com/docs/grafana/latest/datasources/pyroscope/profiling-and-tracing/)

---
*Pitfalls research for: PHP 7.4 APM and Profiling System*
*Researched: 2026-01-27*
*Confidence: HIGH (verified with multiple authoritative sources, current 2025-2026 content)*
