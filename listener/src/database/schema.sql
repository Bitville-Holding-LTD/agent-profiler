-- Unified table for all profiling data (PHP agents + Postgres agent)
CREATE TABLE IF NOT EXISTS profiling_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correlation_id TEXT NOT NULL,
    project TEXT NOT NULL,
    source TEXT NOT NULL,  -- 'php_agent' or 'postgres_agent'
    timestamp INTEGER NOT NULL,  -- Unix timestamp (seconds)
    duration_ms REAL,  -- Request duration, NULL for DB-only records
    payload TEXT NOT NULL,  -- Full JSON payload
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for required query patterns (STOR-03)
CREATE INDEX IF NOT EXISTS idx_correlation_id ON profiling_data(correlation_id);
CREATE INDEX IF NOT EXISTS idx_project_timestamp ON profiling_data(project, timestamp);
CREATE INDEX IF NOT EXISTS idx_duration ON profiling_data(duration_ms) WHERE duration_ms IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_timestamp ON profiling_data(source, timestamp);
CREATE INDEX IF NOT EXISTS idx_created_at ON profiling_data(created_at);  -- For retention cleanup
