"""
Circuit breaker for HTTP transmission.

Opens after 5 consecutive failures, closes after 60 seconds.
Prevents overwhelming listener during outages.
"""
from typing import Optional
from pybreaker import CircuitBreaker, CircuitBreakerError
import structlog

logger = structlog.get_logger()

# Module-level circuit breaker instance
_breaker: Optional[CircuitBreaker] = None


def _on_state_change(breaker: CircuitBreaker, old_state: str, new_state: str):
    """Log circuit breaker state changes."""
    logger.warning(
        "circuit_breaker_state_change",
        breaker=breaker.name,
        old_state=old_state,
        new_state=new_state
    )


def get_circuit_breaker(
    fail_max: int = 5,
    timeout_duration: int = 60
) -> CircuitBreaker:
    """
    Get or create the circuit breaker instance.

    Args:
        fail_max: Number of failures before opening (default: 5)
        timeout_duration: Seconds before attempting to close (default: 60)

    Returns:
        CircuitBreaker instance
    """
    global _breaker

    if _breaker is None:
        _breaker = CircuitBreaker(
            fail_max=fail_max,
            reset_timeout=timeout_duration,
            name="listener_http"
        )
        # Add state change listener
        _breaker.add_listener(_on_state_change)
        logger.info(
            "circuit_breaker_created",
            fail_max=fail_max,
            timeout_duration=timeout_duration
        )

    return _breaker


def is_circuit_open() -> bool:
    """
    Check if circuit breaker is open.

    Returns:
        True if circuit is open (should not attempt requests)
    """
    if _breaker is None:
        return False
    return _breaker.current_state == 'open'


def reset_circuit_breaker():
    """Reset circuit breaker to closed state (for testing)."""
    global _breaker
    if _breaker is not None:
        _breaker._state = 'closed'
        _breaker._failure_count = 0
