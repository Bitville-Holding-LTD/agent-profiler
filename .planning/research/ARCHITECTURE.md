# Architecture Research: APM and Centralized Logging Systems

**Domain:** Application Performance Monitoring (APM) with distributed agents and centralized collection
**Researched:** 2026-01-27
**Confidence:** HIGH

## Standard APM Architecture

### System Overview

APM systems follow a proven three-tier architecture pattern that separates concerns between data collection, aggregation, and forwarding:

```
┌──────────────────────────────────────────────────────────────────────┐
│                    APPLICATION TIER (Multiple Hosts)                  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │
│  │ PHP Agent   │  │ PHP Agent   │  │ PHP Agent   │  (Web Servers)    │
│  │  (Daemon)   │  │  (Daemon)   │  │  (Daemon)   │                   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                   │
│         │                 │                 │                          │
│  ┌──────┴─────────────────┴─────────────────┴──────┐                 │
│  │           Local Buffer (Memory/Disk)             │                 │
│  └──────────────────────┬───────────────────────────┘                 │
│                         │ Async Push (HTTP/UDP)                       │
├─────────────────────────┼───────────────────────────────────────────┤
│  ┌─────────────────┐    │                                             │
│  │ Postgres Agent  │────┘                                             │
│  │    (Daemon)     │                    (Database Server)             │
│  └─────────────────┘                                                  │
├──────────────────────────────────────────────────────────────────────┤
│                     COLLECTION TIER (Central Server)                  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Central Listener                             │  │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐     │  │
│  │  │Receivers │→ │ Processors │→ │ Storage  │→ │Exporters │     │  │
│  │  │(HTTP/UDP)│  │ (Enrich)   │  │ (SQLite) │  │  (GELF)  │     │  │
│  │  └──────────┘  └────────────┘  └──────────┘  └──────────┘     │  │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                     SINK TIER (Log Management)                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    Graylog (GELF)                             │    │
│  │            Long-term storage, analysis, alerting              │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **PHP Agent Daemon** | Non-blocking capture of profiling data for requests >500ms. Must respond <50ms. Instruments PHP runtime, generates correlation IDs. | Separate daemon process with PHP extension communicating via Unix socket. Agent extension hooks into PHP request lifecycle. |
| **Postgres Agent Daemon** | Capture DB metrics, logs, query activity. Correlate queries with request IDs from PHP agents. | Standalone daemon that queries pg_stat_activity, parses logs, connects to pg_stat_statements. |
| **Central Listener** | Receive data from all agents, aggregate, enrich with metadata, store locally (7-day retention), forward to Graylog GELF. | Single service with HTTP/UDP receivers, in-memory batching, SQLite for durability, GELF exporter. |
| **Local Buffer** | Persist telemetry when listener unavailable. Retry with backoff. Prevent memory exhaustion. | Memory buffer (fast path) + disk overflow (SQLite or flat files). Configurable size limits. |
| **GELF Exporter** | Transform telemetry to GELF format, send to Graylog via UDP/TCP/HTTP. | Batching exporter with retry logic and circuit breaker for Graylog availability. |

## Recommended Project Structure

```
bitville-monitoring/
├── php-agent/              # PHP agent daemon + extension
│   ├── extension/          # PHP extension (C/C++)
│   │   ├── hooks.c         # PHP lifecycle hooks
│   │   ├── instrumentation.c
│   │   └── socket.c        # Unix socket client
│   ├── daemon/             # Daemon process (Go/Python)
│   │   ├── collector.go    # Receives from extension
│   │   ├── buffer.go       # Local buffering
│   │   └── forwarder.go    # Sends to listener
│   └── config/
│       └── php-agent.yaml  # Configuration
├── postgres-agent/         # Postgres monitoring daemon
│   ├── collectors/         # Metric collectors
│   │   ├── pg_stat.go      # Query pg_stat_* views
│   │   ├── logs.go         # Parse PG logs
│   │   └── statements.go   # pg_stat_statements
│   ├── correlator.go       # Match queries to request IDs
│   ├── buffer.go           # Local buffering
│   └── forwarder.go        # Sends to listener
├── central-listener/       # Central collection service
│   ├── receivers/          # Input handlers
│   │   ├── http.go         # HTTP endpoint
│   │   └── udp.go          # UDP endpoint (optional)
│   ├── processors/         # Data transformation
│   │   ├── enricher.go     # Add metadata
│   │   ├── correlator.go   # Join PHP + PG data
│   │   └── sampler.go      # Rate limiting
│   ├── storage/            # Local persistence
│   │   ├── sqlite.go       # 7-day SQLite storage
│   │   └── retention.go    # Cleanup old data
│   ├── exporters/          # Output handlers
│   │   ├── gelf.go         # Graylog GELF format
│   │   └── retry.go        # Retry logic
│   └── server.go           # Main service
├── shared/                 # Shared libraries
│   ├── protocol/           # Wire format definitions
│   │   ├── telemetry.proto # Protobuf schemas
│   │   └── correlation.go  # Correlation ID handling
│   ├── compression/        # GZIP/ZLIB support
│   └── auth/               # Optional auth
└── config/
    └── listener.yaml       # Central config
```

### Structure Rationale

- **php-agent/**: Two-part architecture (extension + daemon) follows [New Relic PHP agent design](https://docs.newrelic.com/docs/apm/agents/php-agent/getting-started/introduction-new-relic-php/) and [Datadog PHP tracing](https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/php/). Extension must be minimal C code for speed; daemon handles complex logic.
- **postgres-agent/**: Single daemon, no need for low-level hooks. Can be pure Go/Python.
- **central-listener/**: Follows [OpenTelemetry Collector component model](https://opentelemetry.io/docs/collector/) (receivers → processors → exporters) which is the industry standard for telemetry pipelines.
- **shared/**: DRY principle for correlation IDs, wire formats, compression.

## Architectural Patterns

### Pattern 1: Agent-Daemon Split (PHP Agent)

**What:** PHP extension handles instrumentation; separate daemon process handles buffering and network I/O.

**When to use:** When instrumentation must be extremely low-latency (< 50ms) and run in the application process, but you need complex logic (buffering, compression, retries) that shouldn't block the app.

**Trade-offs:**
- **Pro:** Instrumentation overhead is minimal. Daemon crash doesn't kill app.
- **Pro:** Unix sockets are [5-10% faster than TCP loopback](https://medium.com/@sanathshetty444/beyond-http-unleashing-the-power-of-unix-domain-sockets-for-high-performance-microservices-252eee7b96ad), lower latency.
- **Con:** Two processes to manage. Socket communication adds complexity.

**Example:**
```go
// PHP extension sends via Unix socket (non-blocking)
// daemon/collector.go
func (c *Collector) Listen(socketPath string) error {
    listener, err := net.Listen("unix", socketPath)
    if err != nil {
        return err
    }
    defer listener.Close()

    for {
        conn, err := listener.Accept()
        if err != nil {
            log.Printf("Accept error: %v", err)
            continue
        }
        go c.handleConnection(conn)  // Non-blocking
    }
}

func (c *Collector) handleConnection(conn net.Conn) {
    defer conn.Close()
    decoder := json.NewDecoder(conn)

    var event TelemetryEvent
    if err := decoder.Decode(&event); err != nil {
        log.Printf("Decode error: %v", err)
        return
    }

    // Add to in-memory buffer (fast)
    c.buffer.Add(event)
}
```

### Pattern 2: Push-Based Data Flow with Local Buffering

**What:** Agents push data to collector asynchronously. If collector is unavailable, buffer locally (memory → disk overflow).

**When to use:** When agents are distributed, real-time delivery is desired but not required, and you must never cause application failures due to monitoring.

**Trade-offs:**
- **Pro:** Decouples agents from collector availability. Low latency in happy path.
- **Pro:** Follows [OpenTelemetry best practices](https://bindplane.com/blog/how-to-build-resilient-telemetry-pipelines-with-the-opentelemetry-collector-high-availability-and-gateway-architecture) for resilient telemetry.
- **Con:** Potential data loss if agent crashes with unsent buffer. Must manage buffer size limits.

**Example:**
```go
// daemon/forwarder.go
type Forwarder struct {
    memBuffer    *RingBuffer      // Fast in-memory buffer
    diskBuffer   *SQLiteBuffer    // Overflow to disk
    httpClient   *http.Client
    listenerURL  string
    maxRetries   int
}

func (f *Forwarder) Send(batch []TelemetryEvent) error {
    // Try to send immediately
    if err := f.sendHTTP(batch); err != nil {
        log.Printf("Send failed, buffering: %v", err)

        // Add to memory buffer
        if f.memBuffer.IsFull() {
            // Overflow to disk
            return f.diskBuffer.Write(batch)
        }
        return f.memBuffer.Add(batch)
    }
    return nil
}

func (f *Forwarder) Retry() {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        // Try to flush disk buffer first
        if !f.diskBuffer.IsEmpty() {
            batch := f.diskBuffer.ReadBatch(100)
            if err := f.sendHTTP(batch); err == nil {
                f.diskBuffer.MarkSent(batch)
            }
        }

        // Then memory buffer
        if !f.memBuffer.IsEmpty() {
            batch := f.memBuffer.ReadBatch(100)
            if err := f.sendHTTP(batch); err == nil {
                f.memBuffer.Remove(batch)
            }
        }
    }
}
```

### Pattern 3: Correlation ID Propagation

**What:** Generate a unique ID at request entry point (PHP agent), propagate through all layers (DB queries, logs), use to join telemetry at collector.

**When to use:** Always, for distributed tracing. This is [table stakes for modern APM](https://www.sapphire.net/blogs-press-releases/correlation-id/).

**Trade-offs:**
- **Pro:** Enables request-level visibility across services. Essential for debugging.
- **Con:** Requires discipline to propagate IDs everywhere. Must handle missing IDs gracefully.

**Example:**
```go
// shared/protocol/correlation.go
type CorrelationID string

func GenerateCorrelationID() CorrelationID {
    // UUID v4 provides sufficient uniqueness without coordination
    return CorrelationID(uuid.New().String())
}

// PHP extension (C code, simplified)
// On request start:
char* correlation_id = generate_uuid();
setenv("REQUEST_ID", correlation_id, 1);  // PHP can access via $_ENV

// Postgres agent correlates via pg_stat_activity.application_name
// PHP sets: pg_connect(..., "application_name='req:$REQUEST_ID'")

// central-listener/processors/correlator.go
func (c *Correlator) JoinPHPandDB(phpEvent PHPEvent, dbEvents []DBEvent) CorrelatedEvent {
    var matchedQueries []DBEvent

    for _, db := range dbEvents {
        if db.CorrelationID == phpEvent.CorrelationID {
            matchedQueries = append(matchedQueries, db)
        }
    }

    return CorrelatedEvent{
        RequestID:     phpEvent.CorrelationID,
        Duration:      phpEvent.Duration,
        Endpoint:      phpEvent.Endpoint,
        DBQueries:     matchedQueries,
        TotalDBTime:   sumDurations(matchedQueries),
    }
}
```

### Pattern 4: Receiver-Processor-Exporter Pipeline

**What:** Central listener separates concerns: receivers handle protocols, processors transform data, exporters handle output formats.

**When to use:** When building a telemetry pipeline that may need to support multiple input/output formats. This is the [OpenTelemetry Collector standard pattern](https://opentelemetry.io/docs/collector/).

**Trade-offs:**
- **Pro:** Highly modular. Easy to add new receivers/exporters without changing core logic.
- **Pro:** Processors can run in parallel or sequentially. Great for enrichment.
- **Con:** More complex than a simple passthrough. Can add latency if not careful.

**Example:**
```go
// central-listener/server.go
type Pipeline struct {
    receivers  []Receiver
    processors []Processor
    exporters  []Exporter
}

func (p *Pipeline) Run(ctx context.Context) error {
    dataChan := make(chan TelemetryEvent, 1000)

    // Start receivers (HTTP, UDP)
    for _, r := range p.receivers {
        go r.Receive(ctx, dataChan)
    }

    // Process pipeline
    for {
        select {
        case event := <-dataChan:
            // Apply processors in sequence
            for _, proc := range p.processors {
                event = proc.Process(event)
            }

            // Fan out to exporters
            for _, exp := range p.exporters {
                go exp.Export(event)  // Async
            }
        case <-ctx.Done():
            return ctx.Err()
        }
    }
}

// receivers/http.go
type HTTPReceiver struct {
    port int
}

func (r *HTTPReceiver) Receive(ctx context.Context, out chan<- TelemetryEvent) error {
    http.HandleFunc("/v1/telemetry", func(w http.ResponseWriter, req *http.Request) {
        var events []TelemetryEvent
        if err := json.NewDecoder(req.Body).Decode(&events); err != nil {
            http.Error(w, err.Error(), http.StatusBadRequest)
            return
        }

        for _, e := range events {
            select {
            case out <- e:
            case <-ctx.Done():
                return
            }
        }

        w.WriteHeader(http.StatusAccepted)
    })

    return http.ListenAndServe(fmt.Sprintf(":%d", r.port), nil)
}
```

### Pattern 5: Circuit Breaker for Downstream Failures

**What:** When Graylog is unavailable, stop trying to send after N failures, wait for cooldown period, then retry.

**When to use:** Always when forwarding to external systems that may be flaky or go down. Prevents wasting resources on failing requests.

**Trade-offs:**
- **Pro:** Prevents resource exhaustion. Fails fast during outages.
- **Con:** Adds complexity. Must tune thresholds carefully.

**Example:**
```go
// exporters/gelf.go
type CircuitBreaker struct {
    failures     int
    maxFailures  int
    state        string  // "closed", "open", "half-open"
    lastFailTime time.Time
    cooldown     time.Duration
}

func (cb *CircuitBreaker) Call(fn func() error) error {
    if cb.state == "open" {
        if time.Since(cb.lastFailTime) > cb.cooldown {
            cb.state = "half-open"
            cb.failures = 0
        } else {
            return errors.New("circuit breaker open")
        }
    }

    err := fn()
    if err != nil {
        cb.failures++
        cb.lastFailTime = time.Now()
        if cb.failures >= cb.maxFailures {
            cb.state = "open"
            log.Printf("Circuit breaker opened after %d failures", cb.failures)
        }
        return err
    }

    // Success, reset
    cb.state = "closed"
    cb.failures = 0
    return nil
}

type GELFExporter struct {
    graylogURL string
    breaker    *CircuitBreaker
}

func (g *GELFExporter) Export(event TelemetryEvent) error {
    return g.breaker.Call(func() error {
        gelfMessage := g.toGELF(event)
        return g.sendUDP(gelfMessage)
    })
}
```

## Data Flow

### Request Flow: PHP Agent → Central Listener

```
[PHP Request Starts] (t=0ms)
    ↓
[PHP Extension: Start timer, generate correlation ID] (t=0ms)
    ↓
[Application executes] (t=0-500ms)
    ↓
[PHP Extension: Check duration] (t=500ms)
    ├─ < 500ms → Discard (no action)
    └─ ≥ 500ms → Continue
        ↓
        [Serialize event to JSON] (t=500ms)
        ↓
        [Send via Unix socket (non-blocking)] (t=501ms)
        ↓
        [PHP Agent Daemon: Receive on socket] (t=501ms)
        ↓
        [Add to in-memory buffer] (t=501ms)
        ↓
        [Return success to PHP extension] (t=502ms)
        ↓
[PHP Request completes] (t=550ms total)

[Daemon: Batch processor runs every 5 seconds]
    ↓
[Compress batch (GZIP)]
    ↓
[HTTP POST to central listener]
    ├─ Success → Clear buffer
    └─ Failure → Retry with backoff, overflow to disk
```

### Request Flow: Postgres Agent → Central Listener

```
[Postgres Agent: Poll pg_stat_activity every 100ms]
    ↓
[Find queries with application_name containing 'req:$CORRELATION_ID']
    ↓
[Extract: query text, duration, correlation ID, wait events]
    ↓
[Batch in memory (up to 100 events or 5 seconds)]
    ↓
[HTTP POST to central listener]
    ├─ Success → Clear buffer
    └─ Failure → Retry with backoff, overflow to disk
```

### Central Listener: Receive → Store → Forward

```
[HTTP Receiver: Accept POST /v1/telemetry]
    ↓
[Deserialize JSON] (< 10ms)
    ↓
[Processor 1: Enrich with metadata]
    ├─ Add hostname, timestamp, version
    ↓
[Processor 2: Correlate PHP + DB events]
    ├─ Join by correlation ID
    ├─ Calculate total DB time
    └─ Attach DB queries to PHP request
    ↓
[Storage: Write to SQLite (async)]
    ├─ 7-day retention enforced
    └─ Used for debugging, replay
    ↓
[GELF Exporter: Transform to GELF format]
    ├─ Map fields to GELF schema
    ├─ Batch (up to 50 events or 1 second)
    └─ Compress (GZIP)
    ↓
[Send to Graylog via UDP/TCP/HTTP]
    ├─ Circuit breaker protects against Graylog outage
    └─ Retry with exponential backoff
```

### Correlation Flow

```
Request Entry (PHP):
    correlation_id = "req-a1b2c3d4-e5f6-4789-abcd-1234567890ab"

PHP Agent Event:
    {
        "correlation_id": "req-a1b2c3d4-e5f6-4789-abcd-1234567890ab",
        "endpoint": "/api/users",
        "duration_ms": 850,
        "timestamp": "2026-01-27T10:15:30Z"
    }

Postgres Query (same request):
    application_name = "req:req-a1b2c3d4-e5f6-4789-abcd-1234567890ab"
    query = "SELECT * FROM users WHERE id = $1"

Postgres Agent Event:
    {
        "correlation_id": "req-a1b2c3d4-e5f6-4789-abcd-1234567890ab",
        "query": "SELECT * FROM users WHERE id = $1",
        "duration_ms": 45,
        "timestamp": "2026-01-27T10:15:30.120Z"
    }

Central Listener Correlated Event:
    {
        "correlation_id": "req-a1b2c3d4-e5f6-4789-abcd-1234567890ab",
        "endpoint": "/api/users",
        "total_duration_ms": 850,
        "db_time_ms": 45,
        "queries": [
            {"query": "SELECT * FROM users WHERE id = $1", "duration_ms": 45}
        ]
    }
```

## Communication Protocols

### Agent → Listener Communication

**Recommendation: HTTP POST with JSON over HTTPS**

| Protocol | Pros | Cons | Use When |
|----------|------|------|----------|
| **HTTP POST** | Ubiquitous, firewalls understand it, easy to debug with curl, supports compression (gzip), retries are well-understood | Slightly higher overhead than UDP | **Recommended for production.** Best balance of reliability and performance. |
| **UDP** | Lowest latency, fire-and-forget | No delivery guarantees, can lose data, harder to debug | Only if ultra-low latency required and some data loss acceptable. Not recommended here due to 7-day retention requirement. |
| **Unix Socket** | Fastest for same-machine communication (5-10% faster than TCP) | Only works on same host | **Use for PHP extension → daemon communication.** Not applicable across network. |
| **gRPC** | Efficient binary protocol, built-in streaming | More complex setup, less ubiquitous tooling | Overkill for this use case. |

**Why HTTP POST:**
- [Datadog agent uses HTTP](https://docs.datadoghq.com/agent/architecture/) for reliability
- Built-in retry semantics (HTTP status codes)
- Easy to add authentication (Bearer tokens)
- Compression support (gzip) reduces bandwidth
- Works through firewalls and proxies

**Payload format:**
```json
POST /v1/telemetry HTTP/1.1
Host: listener.bitville.local:8080
Content-Type: application/json
Content-Encoding: gzip
Authorization: Bearer <token>

{
  "agent_type": "php",
  "agent_version": "1.0.0",
  "hostname": "web01.bitville.local",
  "events": [
    {
      "correlation_id": "req-abc123",
      "timestamp": "2026-01-27T10:15:30Z",
      "endpoint": "/api/users",
      "duration_ms": 850,
      "status_code": 200
    }
  ]
}
```

### Listener → Graylog Communication (GELF)

**Recommendation: GELF over UDP for high throughput, TCP for reliability**

[GELF](https://go2docs.graylog.org/current/getting_in_log_data/gelf.html) supports:
- **UDP**: Fast, fire-and-forget. Use for high-volume, non-critical logs.
- **TCP**: Reliable, connection-oriented. Use for critical telemetry.
- **HTTP**: Most flexible. Use if Graylog is behind load balancer or requires auth.

**For this project:** Start with **GELF over TCP** for reliability during development, consider UDP later if throughput becomes an issue.

**GELF Format:**
```json
{
  "version": "1.1",
  "host": "web01.bitville.local",
  "short_message": "Slow request: /api/users (850ms)",
  "full_message": "Request /api/users took 850ms. Correlated DB query took 45ms.",
  "timestamp": 1706347530.123,
  "level": 6,
  "_correlation_id": "req-abc123",
  "_endpoint": "/api/users",
  "_duration_ms": 850,
  "_db_time_ms": 45
}
```

## Failure Handling and Reliability

### Agent Failure Modes

| Failure Mode | Impact | Mitigation |
|--------------|--------|------------|
| **Agent crashes** | In-memory buffer lost | Flush buffer to disk periodically (every 5s). On restart, load disk buffer. |
| **Listener unavailable** | Events pile up in agent buffer | Memory buffer (fast path) + disk overflow. Retry with exponential backoff (10s, 30s, 1m, 5m). Circuit breaker after 10 failures. |
| **Agent buffer full** | Must drop events | Drop **oldest** events first (FIFO). Log metrics on drops. Alert if drop rate > 1%. |
| **Socket communication fails** | PHP extension can't send to daemon | PHP extension should **never block**. If socket write fails, discard event and continue. Log warning. |
| **Daemon startup race** | PHP processes start before daemon ready | Daemon creates socket early in startup. PHP extension retries connection with timeout. |

### Listener Failure Modes

| Failure Mode | Impact | Mitigation |
|--------------|--------|------------|
| **Listener crashes** | Agents buffer locally | Agents retry until listener recovers. SQLite persists 7 days of data; on restart, replay from disk. |
| **Graylog unavailable** | Can't forward telemetry | Circuit breaker opens after 10 failures. Store in SQLite, retry every 1 minute. Alert operators. |
| **SQLite disk full** | Can't persist telemetry | Set max database size (e.g., 10GB). Run VACUUM and enforce retention (delete > 7 days) hourly. Drop incoming events if disk full. |
| **Processing pipeline slow** | Backpressure on receivers | Bounded channel sizes (e.g., 1000 events). Reject new events with HTTP 503 if buffer full. Add metrics on queue depth. |

### Recommended Retry Strategy

Based on [observability best practices](https://www.getmaxim.ai/articles/multi-agent-system-reliability-failure-patterns-root-causes-and-production-validation-strategies/):

```
Attempt 1: Immediate
Attempt 2: +10s (exponential backoff)
Attempt 3: +30s
Attempt 4: +1m
Attempt 5: +5m
Give up: Circuit breaker opens, retry every 5m indefinitely

Max retries before disk overflow: 5
Max disk buffer size: 1GB (agent), 10GB (listener)
```

### Monitoring the Monitors (Meta-observability)

The monitoring system should monitor itself:

**Agent metrics:**
- Events captured/sec
- Events sent/sec
- Events dropped/sec
- Buffer utilization (memory/disk)
- Connection errors to listener

**Listener metrics:**
- Events received/sec (by agent type)
- Events stored/sec
- Events exported/sec (to Graylog)
- Processing latency (p50, p95, p99)
- SQLite size and retention status
- Circuit breaker state (open/closed)

**Recommended approach:** Agents and listener expose `/metrics` endpoint (Prometheus format). Scrape with Prometheus or push to Graylog as GELF.

## Anti-Patterns

### Anti-Pattern 1: Synchronous Instrumentation

**What people do:** PHP extension makes HTTP call directly to listener on every request.

**Why it's wrong:**
- Adds 10-50ms latency to every request
- If listener is down, all requests fail
- Can't batch events efficiently

**Do this instead:** Use the agent-daemon pattern. Extension sends to local daemon via Unix socket (< 1ms), daemon batches and forwards asynchronously.

### Anti-Pattern 2: Unbounded Buffers

**What people do:** Allow in-memory buffers to grow without limit when listener is unavailable.

**Why it's wrong:**
- Agent or listener consumes all RAM
- Process OOM-killed, data lost anyway
- Worse than gracefully dropping old events

**Do this instead:**
- Set max memory buffer size (e.g., 10MB = ~10k events)
- Overflow to disk with max size (e.g., 1GB)
- Drop oldest events when both buffers full
- Emit metrics on drops

### Anti-Pattern 3: Missing Correlation IDs

**What people do:** Capture PHP metrics and DB metrics separately, but don't correlate them.

**Why it's wrong:**
- Can't answer "which DB queries slowed down this request?"
- Debugging is guesswork

**Do this instead:**
- Generate correlation ID at request start
- Propagate via `$_ENV['REQUEST_ID']` in PHP
- Set Postgres `application_name` to include correlation ID
- Central listener joins events by correlation ID

### Anti-Pattern 4: Blocking on Graylog Delivery

**What people do:** Central listener waits for Graylog ACK before processing next event.

**Why it's wrong:**
- If Graylog is slow, entire pipeline stalls
- Head-of-line blocking
- Wastes listener resources

**Do this instead:**
- Export to Graylog asynchronously (goroutine/thread pool)
- Use circuit breaker to fail fast during Graylog outages
- Buffer in SQLite, retry later
- Return HTTP 202 Accepted to agents immediately

### Anti-Pattern 5: No Backpressure Handling

**What people do:** Accept unlimited events from agents even when processing pipeline is backed up.

**Why it's wrong:**
- Listener OOM-killed
- Processing latency degrades unpredictably

**Do this instead:**
- Bounded channel sizes (e.g., 1000 events)
- If channel full, return HTTP 503 Service Unavailable
- Agents will retry with backoff
- Add metrics on queue depth to detect issues early

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-10 agents** | Single central listener. SQLite storage. No horizontal scaling needed. This is the **MVP target**. |
| **10-100 agents** | Add connection pooling. Consider PostgreSQL instead of SQLite for listener storage. Multiple listener instances behind load balancer (sticky sessions not needed). |
| **100-1000 agents** | Shard agents across multiple listeners (by hostname hash). Use message queue (Kafka/RabbitMQ) between receivers and processors. Scale processors independently. |
| **1000+ agents** | Full distributed architecture. Replace SQLite with Cassandra/ClickHouse. Use Kafka for event streaming. Deploy listeners per datacenter for locality. |

### Scaling Priorities

1. **First bottleneck:** Central listener processing pipeline.
   - **How to fix:** Add more listener instances behind load balancer. Agents round-robin across listeners.

2. **Second bottleneck:** SQLite write throughput (~10k writes/sec).
   - **How to fix:** Batch writes, use WAL mode, or migrate to PostgreSQL for higher write throughput.

3. **Third bottleneck:** Graylog ingestion rate.
   - **How to fix:** Use Graylog clustering. Send to multiple Graylog nodes with client-side load balancing.

## Build Order and Dependencies

Based on the architecture, here's the recommended build order:

### Phase 1: Core Infrastructure
**Build order:**
1. **Shared protocol definitions** (correlation ID, telemetry event schema)
2. **Central listener skeleton** (HTTP receiver only, no processing, just echo back)
3. **Basic GELF exporter** (no retry logic, just send)

**Why first:** All other components depend on the protocol. Listener provides a target for agents to send to.

### Phase 2: PHP Agent
**Build order:**
1. **PHP daemon** (receives on Unix socket, buffers in memory, forwards via HTTP)
2. **PHP extension** (minimal hooks, generate correlation ID, send to daemon)
3. **Buffering and retry logic** in daemon

**Why second:** PHP agent is the primary data source. Get it working end-to-end before adding complexity.

### Phase 3: Postgres Agent
**Build order:**
1. **Collector** (query pg_stat_activity, extract correlation IDs)
2. **Forwarder** (send to central listener)
3. **Buffering and retry logic**

**Why third:** Depends on correlation IDs from PHP agent. Can build in parallel with Phase 4.

### Phase 4: Listener Intelligence
**Build order:**
1. **Correlation processor** (join PHP + DB events)
2. **SQLite storage** (7-day retention)
3. **Enrichment processor** (add metadata)
4. **Retry and circuit breaker** for GELF exporter

**Why fourth:** Core functionality is working. Now add reliability and intelligence.

### Phase 5: Reliability and Monitoring
**Build order:**
1. **Disk overflow** for agent buffers
2. **Circuit breakers** throughout
3. **Meta-observability** (metrics on the monitoring system itself)
4. **Alerting** (agent down, buffer full, listener unavailable)

**Why last:** System is functional. Now make it production-ready.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Graylog** | GELF over TCP/UDP | Listener → Graylog. Use [GELF format 1.1](https://go2docs.graylog.org/current/getting_in_log_data/gelf.html). Support chunking for large messages (>1KB). |
| **Postgres** | Direct SQL queries to pg_stat_activity, pg_stat_statements | Postgres agent → PG. Read-only queries. Use connection pooling. Consider pg_stat_statements for query insights. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **PHP extension ↔ daemon** | Unix socket (JSON) | Non-blocking writes from extension. Daemon uses select/epoll for multiplexing. |
| **Agents ↔ listener** | HTTP POST (JSON/gzip) | Agents batch events (max 100 events or 5s). Listener returns HTTP 202 immediately. |
| **Listener receivers ↔ processors** | In-memory channels (Go) or queues (Python) | Bounded capacity. Backpressure via HTTP 503. |
| **Listener processors ↔ exporters** | In-memory channels | Exporters run async. Circuit breaker on failures. |

## Sources

### Architecture Patterns and Best Practices

- [Agent Architecture - Datadog](https://docs.datadoghq.com/agent/architecture/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [How to Build Resilient Telemetry Pipelines with the OpenTelemetry Collector - Bindplane](https://bindplane.com/blog/how-to-build-resilient-telemetry-pipelines-with-the-opentelemetry-collector-high-availability-and-gateway-architecture)
- [APM Best Practices - Elastic](https://www.elastic.co/blog/apm-best-practices)
- [What is APM - SigNoz](https://signoz.io/guides/what-is-apm/)

### Agent Communication and Buffering

- [DogStatsD over Unix Domain Socket](https://docs.datadoghq.com/developers/dogstatsd/unix_socket/)
- [Beyond HTTP: Unix Domain Sockets for High-Performance Microservices](https://medium.com/@sanathshetty444/beyond-http-unleashing-the-power-of-unix-domain-sockets-for-high-performance-microservices-252eee7b96ad)
- [VictoriaMetrics: vmagent](https://docs.victoriametrics.com/victoriametrics/vmagent/)
- [Jaeger Agent Buffering Issue #1430](https://github.com/jaegertracing/jaeger/issues/1430)

### Correlation and Distributed Tracing

- [What Is Correlation ID in Distributed Systems? - Sapphire](https://www.sapphire.net/blogs-press-releases/correlation-id/)
- [Correlation ID vs Trace ID - Last9](https://last9.io/blog/correlation-id-vs-trace-id/)
- [Correlation IDs - Microsoft Engineering Playbook](https://microsoft.github.io/code-with-engineering-playbook/observability/correlation-id/)
- [Context Propagation - OpenTelemetry](https://opentelemetry.io/docs/concepts/context-propagation/)

### GELF Protocol

- [GELF Inputs - Graylog](https://go2docs.graylog.org/current/getting_in_log_data/gelf.html)
- [GELF - Graylog Extended Log Format](https://archivedocs.graylog.org/en/latest/pages/gelf.html)
- [GitHub - Graylog2/go-gelf](https://github.com/Graylog2/go-gelf)

### PHP Agent Architecture

- [Introduction to New Relic for PHP](https://docs.newrelic.com/docs/apm/agents/php-agent/getting-started/introduction-new-relic-php/)
- [Tracing PHP Applications - Datadog](https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/php/)

### Reliability and Failure Handling

- [Multi-Agent System Reliability - Maxim AI](https://www.getmaxim.ai/articles/multi-agent-system-reliability-failure-patterns-root-causes-and-production-validation-strategies/)
- [AI Agent Monitoring Best Practices - UptimeRobot](https://uptimerobot.com/knowledge-hub/monitoring/ai-agent-monitoring-best-practices-tools-and-metrics/)
- [Handling Failures in Distributed Systems - Statsig](https://www.statsig.com/perspectives/handling-failures-in-distributed-systems-patterns-and-anti-patterns)

### Storage and Retention

- [Appropriate Uses For SQLite](https://sqlite.org/whentouse.html)
- [SQLite Monitoring Tool - Atatus](https://www.atatus.com/database-monitoring/sqlite-monitoring)

---
*Architecture research for: APM and Centralized Logging*
*Researched: 2026-01-27*
