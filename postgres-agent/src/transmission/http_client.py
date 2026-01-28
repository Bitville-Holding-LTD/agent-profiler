"""
HTTP client for sending data to listener server.

PG-COMM-01: Send collected data to listener server via HTTP POST
PG-COMM-03: Include project identifier with all sent data
"""
import json
import time
from typing import Any
import requests
from pybreaker import CircuitBreakerError
import structlog

from ..config import Config
from .circuit_breaker import get_circuit_breaker
from .buffer import buffer_data

logger = structlog.get_logger()


def send_to_listener(
    data: dict[str, Any],
    config: Config,
    source: str
) -> bool:
    """
    Send data to listener with circuit breaker protection.

    Falls back to buffering if circuit is open or request fails.

    Args:
        data: Data payload to send
        config: Agent configuration
        source: Source type (pg_stat_activity, pg_stat_statements, pg_log, system_metrics)

    Returns:
        True if sent successfully, False if buffered
    """
    breaker = get_circuit_breaker(
        fail_max=config.circuit_breaker_fail_max,
        timeout_duration=config.circuit_breaker_timeout_s
    )

    # Build payload matching listener's PostgresPayloadSchema
    payload = {
        'correlation_id': data.get('correlation_id', ''),
        'project': config.project_id,  # PG-COMM-03
        'timestamp': time.time(),
        'source': source,
        'data': data
    }

    try:
        # Attempt send with circuit breaker
        @breaker
        def _send():
            response = requests.post(
                config.listener_url,
                json=payload,
                headers={
                    'Authorization': f'Bearer {config.listener_api_key}',
                    'Content-Type': 'application/json'
                },
                timeout=config.listener_timeout_s
            )
            response.raise_for_status()
            return response

        response = _send()

        logger.debug(
            "data_sent_to_listener",
            source=source,
            status=response.status_code,
            bytes=len(json.dumps(payload))
        )
        return True

    except CircuitBreakerError:
        logger.warning(
            "circuit_open_buffering",
            source=source
        )
        buffer_data(payload)
        return False

    except requests.RequestException as e:
        logger.warning(
            "listener_request_failed_buffering",
            source=source,
            error=str(e)
        )
        buffer_data(payload)
        return False

    except Exception as e:
        logger.error(
            "send_to_listener_unexpected_error",
            source=source,
            error=str(e)
        )
        buffer_data(payload)
        return False


def send_batch_to_listener(
    items: list[dict[str, Any]],
    config: Config,
    source: str
) -> tuple[int, int]:
    """
    Send batch of items to listener.

    Args:
        items: List of data items
        config: Agent configuration
        source: Source type

    Returns:
        Tuple of (sent_count, buffered_count)
    """
    sent = 0
    buffered = 0

    for item in items:
        if send_to_listener(item, config, source):
            sent += 1
        else:
            buffered += 1

    return sent, buffered
