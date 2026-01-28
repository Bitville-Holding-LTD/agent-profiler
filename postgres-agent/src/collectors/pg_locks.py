"""
Lock detection collector.

Detects blocking queries and lock contention using pg_locks
combined with pg_stat_activity.

PG-06: Detect and report database locks and blocking queries
"""
from typing import Any
from psycopg_pool import ConnectionPool
import structlog

logger = structlog.get_logger()


def detect_blocking_queries(pool: ConnectionPool) -> list[dict[str, Any]]:
    """
    Detect blocking queries and lock contention.

    Uses the PostgreSQL wiki lock monitoring query to find
    blocked processes and their blockers.

    Source: https://wiki.postgresql.org/wiki/Lock_Monitoring

    Args:
        pool: Database connection pool

    Returns:
        List of blocking situations with blocker and blocked info
    """
    # PostgreSQL wiki lock monitoring query
    query = """
        SELECT
            blocked_locks.pid AS blocked_pid,
            blocked_activity.usename AS blocked_user,
            blocked_activity.application_name AS blocked_application,
            blocked_activity.client_addr AS blocked_client_addr,
            blocked_activity.query AS blocked_query,
            blocked_activity.query_start AS blocked_query_start,
            blocking_locks.pid AS blocking_pid,
            blocking_activity.usename AS blocking_user,
            blocking_activity.application_name AS blocking_application,
            blocking_activity.client_addr AS blocking_client_addr,
            blocking_activity.query AS blocking_query,
            blocking_activity.query_start AS blocking_query_start,
            blocked_locks.locktype,
            blocked_locks.mode AS blocked_mode,
            blocking_locks.mode AS blocking_mode
        FROM pg_catalog.pg_locks blocked_locks
        JOIN pg_catalog.pg_stat_activity blocked_activity
            ON blocked_activity.pid = blocked_locks.pid
        JOIN pg_catalog.pg_locks blocking_locks
            ON blocking_locks.locktype = blocked_locks.locktype
            AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
            AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
            AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
            AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
            AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
            AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
            AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
            AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
            AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
            AND blocking_locks.pid != blocked_locks.pid
        JOIN pg_catalog.pg_stat_activity blocking_activity
            ON blocking_activity.pid = blocking_locks.pid
        WHERE NOT blocked_locks.granted
        ORDER BY blocked_activity.query_start
        LIMIT 50
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

            # Convert timestamps to ISO format
            for ts_field in ['blocked_query_start', 'blocking_query_start']:
                if record.get(ts_field):
                    record[ts_field] = record[ts_field].isoformat()

            # Convert IP addresses to strings
            for addr_field in ['blocked_client_addr', 'blocking_client_addr']:
                if record.get(addr_field):
                    record[addr_field] = str(record[addr_field])

            # Truncate long queries
            for query_field in ['blocked_query', 'blocking_query']:
                if record.get(query_field) and len(record[query_field]) > 500:
                    record[query_field] = record[query_field][:500] + '...[truncated]'

            results.append(record)

        if results:
            logger.warning(
                "blocking_queries_detected",
                count=len(results),
                blocked_pids=[r['blocked_pid'] for r in results]
            )
        else:
            logger.debug("no_blocking_queries_detected")

        return results

    except Exception as e:
        logger.error("lock_detection_failed", error=str(e))
        return []
