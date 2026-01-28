"""
pg_stat_statements collector.

Queries pg_stat_statements for query performance statistics.
Gracefully degrades if extension is not installed.

PG-02: Query pg_stat_statements for query performance statistics
"""
from typing import Any, Optional
from psycopg_pool import ConnectionPool
import structlog

logger = structlog.get_logger()

# Cache extension availability check
_extension_available: Optional[bool] = None


def check_pg_stat_statements(pool: ConnectionPool) -> bool:
    """
    Check if pg_stat_statements extension is installed.

    Result is cached after first check.

    Args:
        pool: Database connection pool

    Returns:
        True if extension is available
    """
    global _extension_available

    if _extension_available is not None:
        return _extension_available

    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*) FROM pg_extension
                    WHERE extname = 'pg_stat_statements'
                """)
                result = cur.fetchone()
                _extension_available = result is not None and result[0] > 0

        if _extension_available:
            logger.info("pg_stat_statements_available")
        else:
            logger.warning(
                "pg_stat_statements_not_installed",
                hint="Install with: CREATE EXTENSION pg_stat_statements;"
            )

        return _extension_available

    except Exception as e:
        logger.error("pg_stat_statements_check_failed", error=str(e))
        _extension_available = False
        return False


def collect_pg_statements(pool: ConnectionPool, limit: int = 100) -> list[dict[str, Any]]:
    """
    Collect query performance statistics from pg_stat_statements.

    Returns top queries by total execution time.
    Returns empty list if extension is not installed (graceful degradation).

    Args:
        pool: Database connection pool
        limit: Maximum number of queries to return (default: 100)

    Returns:
        List of query statistics dicts
    """
    if not check_pg_stat_statements(pool):
        return []

    # Query works with pg_stat_statements 1.8+ (PostgreSQL 13+)
    # Includes: calls, total_exec_time, mean_exec_time, rows, etc.
    query = """
        SELECT
            queryid,
            query,
            calls,
            total_exec_time,
            mean_exec_time,
            min_exec_time,
            max_exec_time,
            stddev_exec_time,
            rows,
            shared_blks_hit,
            shared_blks_read,
            shared_blks_written,
            local_blks_hit,
            local_blks_read,
            local_blks_written,
            temp_blks_read,
            temp_blks_written,
            blk_read_time,
            blk_write_time
        FROM pg_stat_statements
        ORDER BY total_exec_time DESC
        LIMIT %s
    """

    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (limit,))
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()

        results = []
        for row in rows:
            record = dict(zip(columns, row))

            # Convert queryid to string (it's a bigint)
            if record.get('queryid'):
                record['queryid'] = str(record['queryid'])

            # Truncate long queries to prevent payload bloat
            if record.get('query') and len(record['query']) > 1000:
                record['query'] = record['query'][:1000] + '...[truncated]'

            results.append(record)

        logger.debug(
            "pg_statements_collected",
            statement_count=len(results),
            top_query_time_ms=results[0].get('total_exec_time') if results else 0
        )

        return results

    except Exception as e:
        logger.error("pg_statements_collection_failed", error=str(e))
        # Return empty list on error (graceful degradation)
        return []
