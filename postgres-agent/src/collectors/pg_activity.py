"""
pg_stat_activity collector.

Queries pg_stat_activity for active queries and extracts correlation IDs
from application_name for linking to PHP requests.

PG-01: Query pg_stat_activity every minute for active queries and locks
PG-05: Match correlation IDs from PHP via application_name parameter
"""
import re
from typing import Any
from psycopg_pool import ConnectionPool
import structlog

logger = structlog.get_logger()

# Pattern to extract correlation ID from application_name
# PHP agent sets: "bitville-{correlation_id}"
CORRELATION_PATTERN = re.compile(r'bitville-([a-f0-9-]{36})')


def collect_pg_activity(pool: ConnectionPool) -> list[dict[str, Any]]:
    """
    Collect active queries from pg_stat_activity.

    Extracts correlation IDs from application_name field for PHP request linking.
    Only collects non-idle connections to minimize overhead.

    Args:
        pool: Database connection pool

    Returns:
        List of active session dicts with correlation_id if present
    """
    query = """
        SELECT
            pid,
            usename,
            application_name,
            client_addr,
            client_port,
            backend_start,
            xact_start,
            query_start,
            state_change,
            wait_event_type,
            wait_event,
            state,
            query,
            backend_type
        FROM pg_stat_activity
        WHERE state != 'idle'
          AND pid != pg_backend_pid()
        ORDER BY query_start DESC NULLS LAST
        LIMIT 100
    """

    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()

        results = []
        for row in rows:
            record = dict(zip(columns, row))

            # Extract correlation ID from application_name (PG-05)
            app_name = record.get('application_name', '')
            match = CORRELATION_PATTERN.search(app_name) if app_name else None
            record['correlation_id'] = match.group(1) if match else None

            # Convert timestamps to ISO format strings
            for ts_field in ['backend_start', 'xact_start', 'query_start', 'state_change']:
                if record.get(ts_field):
                    record[ts_field] = record[ts_field].isoformat()

            # Convert IP address to string
            if record.get('client_addr'):
                record['client_addr'] = str(record['client_addr'])

            results.append(record)

        logger.debug(
            "pg_activity_collected",
            active_sessions=len(results),
            with_correlation=sum(1 for r in results if r.get('correlation_id'))
        )

        return results

    except Exception as e:
        logger.error("pg_activity_collection_failed", error=str(e))
        raise
