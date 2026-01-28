"""
PostgreSQL connection pool with safety limits.

Ensures monitoring queries cannot impact database performance:
- Statement timeout on all queries (5s default)
- Limited connection pool (max 5 connections)
- Connection acquisition timeout
- Graceful pool shutdown

PG-07: Never cause database failures or performance degradation
"""
from typing import Optional
from psycopg_pool import ConnectionPool
import structlog

from ..config import Config

logger = structlog.get_logger()

# Module-level pool instance
_pool: Optional[ConnectionPool] = None


def create_pool(config: Config) -> ConnectionPool:
    """
    Create connection pool with safety limits.

    Safety measures:
    1. statement_timeout in connection options (query timeout)
    2. Limited pool size (max 5 connections)
    3. Connection acquisition timeout
    4. Application name for identification in pg_stat_activity

    Args:
        config: Agent configuration

    Returns:
        ConnectionPool instance
    """
    global _pool

    # Build connection string
    conninfo = (
        f"host={config.db_host} "
        f"port={config.db_port} "
        f"dbname={config.db_name} "
        f"user={config.db_user} "
        f"password={config.db_password}"
    )

    # Safety: statement_timeout prevents hung queries
    # Safety: application_name identifies our connections in pg_stat_activity
    connection_kwargs = {
        "options": f"-c statement_timeout={config.statement_timeout_ms}",
        "application_name": "bitville-monitor"
    }

    logger.info(
        "creating_connection_pool",
        host=config.db_host,
        port=config.db_port,
        db=config.db_name,
        user=config.db_user,
        min_size=config.pool_min_size,
        max_size=config.pool_max_size,
        statement_timeout_ms=config.statement_timeout_ms
    )

    _pool = ConnectionPool(
        conninfo=conninfo,
        min_size=config.pool_min_size,
        max_size=config.pool_max_size,
        timeout=float(config.connection_timeout_s),
        kwargs=connection_kwargs,
        # Open pool immediately to verify connection
        open=True
    )

    # Test connection
    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                result = cur.fetchone()
                if result and result[0] == 1:
                    logger.info("connection_pool_verified", status="healthy")
    except Exception as e:
        logger.error("connection_pool_test_failed", error=str(e))
        raise

    return _pool


def get_pool() -> ConnectionPool:
    """
    Get the current connection pool.

    Raises:
        RuntimeError: If pool not initialized (call create_pool first)

    Returns:
        ConnectionPool instance
    """
    if _pool is None:
        raise RuntimeError("Connection pool not initialized. Call create_pool() first.")
    return _pool


def close_pool() -> None:
    """
    Close the connection pool gracefully.

    Should be called during agent shutdown.
    """
    global _pool
    if _pool is not None:
        logger.info("closing_connection_pool")
        _pool.close()
        _pool = None


async def check_pool_health() -> dict:
    """
    Check connection pool health.

    Returns:
        Dict with pool statistics
    """
    if _pool is None:
        return {"status": "not_initialized"}

    try:
        stats = _pool.get_stats()
        return {
            "status": "healthy",
            "pool_size": stats.get("pool_size", 0),
            "pool_available": stats.get("pool_available", 0),
            "requests_waiting": stats.get("requests_waiting", 0),
            "connections_num": stats.get("connections_num", 0),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}
