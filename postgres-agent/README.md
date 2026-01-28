# Bitville PostgreSQL Monitoring Agent

A lightweight monitoring agent that collects database statistics, system metrics, and log data from PostgreSQL servers and sends them to the central Bitville listener.

## Features

- **pg_stat_activity polling** - Active queries, locks, connection state
- **pg_stat_statements** - Query performance statistics (if extension installed)
- **Lock detection** - Blocking queries and lock contention
- **System metrics** - CPU, memory, disk I/O via psutil
- **Log parsing** - Continuous PostgreSQL log file tailing
- **Correlation** - Links PHP requests via application_name
- **Resilience** - Circuit breaker + local buffering for outages

## Requirements

- Python 3.11+
- PostgreSQL 12+ (for full feature support)
- Access to pg_stat_activity (pg_read_all_stats role)
- Network access to listener server (88.198.22.206:8443)

## Quick Start

### 1. Install Dependencies

```bash
cd /opt/bitville-postgres-agent
pip install -r requirements.txt
```

### 2. Create Configuration

```bash
sudo mkdir -p /etc/bitville
sudo cp config/agent.ini.example /etc/bitville/postgres-agent.ini
sudo nano /etc/bitville/postgres-agent.ini
```

Edit configuration:
- Set `host` to your PostgreSQL host (or localhost)
- Set `user` and `password` for monitoring user
- Set `api_key` to your Bitville API key
- Set `project_id` to identify this server

### 3. Create Buffer Directory

```bash
sudo mkdir -p /var/lib/bitville-postgres-agent
sudo chown bitville-agent:bitville-agent /var/lib/bitville-postgres-agent
```

### 4. Create Monitoring User (PostgreSQL)

```sql
-- Run as superuser
CREATE USER bitville_monitor WITH PASSWORD 'secure_password';
GRANT pg_read_all_stats TO bitville_monitor;

-- For pg_stat_statements (optional)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### 5. Install systemd Service

```bash
sudo cp systemd/postgres-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable postgres-agent
sudo systemctl start postgres-agent
```

### 6. Verify

```bash
# Check service status
sudo systemctl status postgres-agent

# View logs
sudo journalctl -u postgres-agent -f

# Check listener is receiving data
curl https://88.198.22.206:8443/ready
```

## Configuration

### INI File

`/etc/bitville/postgres-agent.ini`:

```ini
[database]
host = localhost
port = 5432
name = postgres
user = bitville_monitor
password = your_password
statement_timeout_ms = 5000

[collection]
interval_s = 60
log_path = /var/log/postgresql/postgresql-main.log

[listener]
url = https://88.198.22.206:8443/ingest/postgres
api_key = your_api_key_here
project_id = myproject

[buffer]
path = /var/lib/bitville-postgres-agent/buffer
max_size_mb = 100
```

### Environment Variables

All settings can be overridden via environment:

```bash
BITVILLE_PG_DB_HOST=localhost
BITVILLE_PG_DB_PASSWORD=secret
BITVILLE_PG_LISTENER_API_KEY=your_key
BITVILLE_PG_PROJECT_ID=myproject
```

## Safety Guarantees

The agent is designed to **never** impact database performance:

1. **Statement timeout** - All queries timeout after 5 seconds
2. **Connection pool limit** - Maximum 5 connections
3. **Resource limits** - systemd enforces 256MB memory, 25% CPU
4. **Graceful degradation** - Missing extensions don't cause failures
5. **Circuit breaker** - Stops transmission attempts during outages

## Troubleshooting

### Agent won't connect to database

1. Check PostgreSQL is running: `pg_isready`
2. Verify credentials: `psql -U bitville_monitor -h localhost`
3. Check pg_hba.conf allows connection

### No data in listener

1. Check API key is correct
2. Verify network connectivity: `curl https://88.198.22.206:8443/health`
3. Check buffer for queued data: `ls -la /var/lib/bitville-postgres-agent/buffer/`

### pg_stat_statements not available

This is optional. Agent will log a warning and continue without query statistics.

To enable:
```sql
-- postgresql.conf
shared_preload_libraries = 'pg_stat_statements'

-- Then restart PostgreSQL and run:
CREATE EXTENSION pg_stat_statements;
```

### High memory usage

Check buffer size - if listener is unavailable, buffer may grow.

```bash
ls -lh /var/lib/bitville-postgres-agent/buffer/
```

Buffer auto-evicts oldest items when exceeding 100MB.

## Development

### Running locally

```bash
# With config file
python -m postgres_agent config/agent.ini.example

# With environment variables
export BITVILLE_PG_DB_HOST=localhost
export BITVILLE_PG_LISTENER_API_KEY=test
python -m postgres_agent
```

### Testing

```bash
# Run tests
pytest tests/

# Run with coverage
pytest --cov=src tests/
```

## License

MIT
