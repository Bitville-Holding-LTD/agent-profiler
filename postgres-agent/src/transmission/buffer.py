"""
Persistent buffer for offline resilience.

Uses SQLite-backed queue for crash recovery.
Implements size limits with oldest-item eviction.

PG-COMM-02: Implement local buffering for listener unavailability
"""
import json
import os
from typing import Any, Optional
from persistqueue import FIFOSQLiteQueue
import structlog

from ..config import Config

logger = structlog.get_logger()

# Module-level buffer instance
_buffer: Optional[FIFOSQLiteQueue] = None
_config: Optional[Config] = None


def init_buffer(config: Config) -> FIFOSQLiteQueue:
    """
    Initialize the persistent buffer.

    Creates buffer directory if it doesn't exist.

    Args:
        config: Agent configuration

    Returns:
        FIFOSQLiteQueue instance
    """
    global _buffer, _config
    _config = config

    # Ensure buffer directory exists
    os.makedirs(config.buffer_path, exist_ok=True)

    _buffer = FIFOSQLiteQueue(
        path=config.buffer_path,
        multithreading=True,
        auto_commit=True
    )

    logger.info(
        "buffer_initialized",
        path=config.buffer_path,
        max_size_mb=config.buffer_max_size_mb
    )

    return _buffer


def get_buffer() -> FIFOSQLiteQueue:
    """
    Get the current buffer instance.

    Raises:
        RuntimeError: If buffer not initialized

    Returns:
        FIFOSQLiteQueue instance
    """
    if _buffer is None:
        raise RuntimeError("Buffer not initialized. Call init_buffer() first.")
    return _buffer


def _check_and_evict_if_needed():
    """
    Check buffer size and evict oldest items if over limit.

    Evicts until buffer is at 80% of max size.
    """
    if _buffer is None or _config is None:
        return

    db_path = os.path.join(_config.buffer_path, "data")
    if not os.path.exists(db_path):
        # Try alternative path
        for fname in os.listdir(_config.buffer_path):
            if fname.endswith('.sqlite') or fname.endswith('.db'):
                db_path = os.path.join(_config.buffer_path, fname)
                break
        else:
            return

    try:
        size_mb = os.path.getsize(db_path) / (1024 * 1024)

        if size_mb > _config.buffer_max_size_mb:
            logger.warning(
                "buffer_size_exceeded_evicting",
                current_mb=round(size_mb, 2),
                max_mb=_config.buffer_max_size_mb
            )

            # Evict until at 80% of max
            target_mb = _config.buffer_max_size_mb * 0.8
            evicted = 0

            while size_mb > target_mb and _buffer.qsize() > 0:
                try:
                    _buffer.get(block=False)
                    _buffer.task_done()
                    evicted += 1
                    size_mb = os.path.getsize(db_path) / (1024 * 1024)
                except Exception:
                    break

            logger.info(
                "buffer_eviction_complete",
                evicted_count=evicted,
                new_size_mb=round(size_mb, 2)
            )

    except Exception as e:
        logger.error("buffer_size_check_failed", error=str(e))


def buffer_data(data: dict[str, Any]) -> bool:
    """
    Add data to buffer with size limit enforcement.

    Args:
        data: Data payload to buffer

    Returns:
        True if buffered successfully
    """
    if _buffer is None:
        logger.error("buffer_not_initialized")
        return False

    try:
        # Check and evict if needed before adding
        _check_and_evict_if_needed()

        # Serialize and buffer
        _buffer.put(json.dumps(data))

        logger.debug(
            "data_buffered",
            queue_size=_buffer.qsize()
        )
        return True

    except Exception as e:
        logger.error("buffer_put_failed", error=str(e))
        return False


def flush_buffer(config: Config, max_items: int = 100) -> tuple[int, int]:
    """
    Attempt to flush buffered data to listener.

    Called when circuit breaker closes or periodically.

    Args:
        config: Agent configuration
        max_items: Maximum items to flush in one call

    Returns:
        Tuple of (sent_count, remaining_count)
    """
    if _buffer is None:
        return 0, 0

    # Import here to avoid circular dependency
    from .http_client import send_to_listener
    from .circuit_breaker import is_circuit_open

    sent = 0
    remaining = _buffer.qsize()

    if remaining == 0:
        return 0, 0

    logger.info("flushing_buffer", items=min(remaining, max_items))

    for _ in range(min(remaining, max_items)):
        if is_circuit_open():
            logger.warning("flush_stopped_circuit_open")
            break

        try:
            item_str = _buffer.get(block=False)
            item = json.loads(item_str)

            # Re-send using http_client (will re-buffer on failure)
            source = item.get('source', 'buffered')
            data = item.get('data', item)

            # Direct request without circuit breaker (already checked above)
            import requests
            response = requests.post(
                config.listener_url,
                json=item,
                headers={
                    'Authorization': f'Bearer {config.listener_api_key}',
                    'Content-Type': 'application/json'
                },
                timeout=config.listener_timeout_s
            )

            if response.status_code == 200:
                _buffer.task_done()
                sent += 1
            else:
                # Put back in queue
                _buffer.put(item_str)
                logger.warning(
                    "flush_item_failed",
                    status=response.status_code
                )
                break

        except Exception as e:
            logger.error("flush_item_error", error=str(e))
            break

    remaining = _buffer.qsize()
    logger.info(
        "buffer_flush_complete",
        sent=sent,
        remaining=remaining
    )

    return sent, remaining


def get_buffer_stats() -> dict[str, Any]:
    """
    Get buffer statistics.

    Returns:
        Dict with queue_size and size_mb
    """
    if _buffer is None:
        return {"status": "not_initialized"}

    stats = {
        "queue_size": _buffer.qsize(),
        "status": "initialized"
    }

    # Try to get file size
    if _config:
        try:
            for fname in os.listdir(_config.buffer_path):
                if fname.endswith('.sqlite') or fname.endswith('.db') or fname == 'data':
                    db_path = os.path.join(_config.buffer_path, fname)
                    if os.path.exists(db_path):
                        stats["size_mb"] = round(
                            os.path.getsize(db_path) / (1024 * 1024), 2
                        )
                        break
        except Exception:
            pass

    return stats


def close_buffer():
    """Close the buffer (call during shutdown)."""
    global _buffer
    if _buffer is not None:
        logger.info("closing_buffer")
        _buffer = None
