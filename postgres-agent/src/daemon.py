"""
PostgreSQL Monitoring Agent Daemon.

Main daemon loop that:
1. Collects data from multiple sources every 60 seconds
2. Transmits to listener with circuit breaker protection
3. Buffers locally during outages
4. Handles graceful shutdown

PG-COMM-04: Run as daemon service on DB server (5.9.121.222)
PG-07: Never cause database failures or performance degradation
"""
import signal
import sys
import threading
import time
from typing import Any, Optional
import structlog

from .config import Config, load_config
from .database.pool import create_pool, close_pool, get_pool
from .collectors import (
    collect_pg_activity,
    collect_pg_statements,
    check_pg_stat_statements,
    detect_blocking_queries,
    collect_system_metrics,
)
from .collectors.log_parser import tail_postgres_log, LogCollector
from .transmission import send_to_listener, is_circuit_open, flush_buffer
from .transmission.buffer import init_buffer, get_buffer_stats, close_buffer

logger = structlog.get_logger()


class PostgresMonitoringAgent:
    """
    PostgreSQL Monitoring Agent.

    Collects database statistics and system metrics,
    sends to central listener, buffers during outages.
    """

    def __init__(self, config: Config):
        """
        Initialize agent.

        Args:
            config: Agent configuration
        """
        self.config = config
        self.running = False
        self._shutdown_event = threading.Event()
        self._log_thread: Optional[threading.Thread] = None
        self._log_collector = LogCollector(max_entries=500)

    def start(self):
        """
        Start the monitoring agent.

        Initializes connection pool, buffer, and starts collection loop.
        """
        logger.info(
            "agent_starting",
            project=self.config.project_id,
            db_host=self.config.db_host,
            listener_url=self.config.listener_url
        )

        # Register signal handlers
        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGHUP, self._handle_reload)

        try:
            # Initialize connection pool with safety limits
            create_pool(self.config)

            # Initialize buffer
            init_buffer(self.config)

            # Check pg_stat_statements availability
            pool = get_pool()
            has_statements = check_pg_stat_statements(pool)
            logger.info(
                "pg_stat_statements_check",
                available=has_statements
            )

            self.running = True

            # Start log parsing thread (PG-03)
            self._start_log_parser_thread()

            # Start main collection loop
            self._collection_loop()

        except Exception as e:
            logger.error("agent_startup_failed", error=str(e))
            self._cleanup()
            raise

    def _start_log_parser_thread(self):
        """Start background thread for continuous log parsing."""
        def log_parser_worker():
            logger.info("log_parser_thread_started")
            try:
                for entry in tail_postgres_log(
                    self.config.postgres_log_path,
                    poll_interval=0.1
                ):
                    if self._shutdown_event.is_set():
                        break

                    # Add to collector buffer
                    should_flush = self._log_collector.add(entry)

                    # Flush if buffer full or has correlation ID (important)
                    if should_flush or entry.get('correlation_id'):
                        self._send_log_entries()

            except Exception as e:
                logger.error("log_parser_thread_error", error=str(e))

        self._log_thread = threading.Thread(
            target=log_parser_worker,
            daemon=True,
            name="log-parser"
        )
        self._log_thread.start()

    def _send_log_entries(self):
        """Send buffered log entries to listener."""
        entries = self._log_collector.flush()
        if not entries:
            return

        # Group entries by severity for sending
        log_data = {
            'entries': entries,
            'count': len(entries),
            'levels': {}
        }

        for entry in entries:
            level = entry.get('level', 'UNKNOWN')
            log_data['levels'][level] = log_data['levels'].get(level, 0) + 1

        send_to_listener(log_data, self.config, 'pg_log')

    def _collection_loop(self):
        """
        Main collection loop.

        Runs every collection_interval_s (default: 60 seconds).
        Collects from all sources and transmits to listener.
        """
        logger.info(
            "collection_loop_starting",
            interval_s=self.config.collection_interval_s
        )

        while self.running:
            cycle_start = time.time()

            try:
                self._collection_cycle()

            except Exception as e:
                logger.error("collection_cycle_failed", error=str(e))

            # Calculate sleep time to maintain interval
            elapsed = time.time() - cycle_start
            sleep_time = max(0, self.config.collection_interval_s - elapsed)

            logger.debug(
                "collection_cycle_complete",
                elapsed_s=round(elapsed, 2),
                sleep_s=round(sleep_time, 2)
            )

            # Wait for next cycle or shutdown
            if self._shutdown_event.wait(timeout=sleep_time):
                break

        logger.info("collection_loop_stopped")

    def _collection_cycle(self):
        """
        Single collection cycle.

        Collects from all sources, sends to listener.
        """
        pool = get_pool()
        results: dict[str, Any] = {}
        errors: list[str] = []

        # Collect pg_stat_activity (PG-01)
        try:
            results['pg_activity'] = collect_pg_activity(pool)
        except Exception as e:
            errors.append(f"pg_activity: {e}")
            results['pg_activity'] = []

        # Collect pg_stat_statements (PG-02)
        try:
            results['pg_statements'] = collect_pg_statements(pool)
        except Exception as e:
            errors.append(f"pg_statements: {e}")
            results['pg_statements'] = []

        # Detect locks (PG-06)
        try:
            results['locks'] = detect_blocking_queries(pool)
        except Exception as e:
            errors.append(f"locks: {e}")
            results['locks'] = []

        # Collect system metrics (PG-04)
        try:
            results['system_metrics'] = collect_system_metrics()
        except Exception as e:
            errors.append(f"system_metrics: {e}")
            results['system_metrics'] = {}

        # Log collection summary
        logger.info(
            "collection_complete",
            active_sessions=len(results['pg_activity']),
            statements=len(results['pg_statements']),
            locks=len(results['locks']),
            errors=errors if errors else None
        )

        # Send each data type to listener
        # pg_stat_activity
        if results['pg_activity']:
            send_to_listener(
                {
                    'sessions': results['pg_activity'],
                    'count': len(results['pg_activity']),
                    'with_correlation': sum(
                        1 for s in results['pg_activity']
                        if s.get('correlation_id')
                    )
                },
                self.config,
                'pg_stat_activity'
            )

        # pg_stat_statements
        if results['pg_statements']:
            send_to_listener(
                {
                    'statements': results['pg_statements'],
                    'count': len(results['pg_statements'])
                },
                self.config,
                'pg_stat_statements'
            )

        # Locks (always send, even if empty - important for alerting)
        send_to_listener(
            {
                'locks': results['locks'],
                'count': len(results['locks']),
                'has_blocking': len(results['locks']) > 0
            },
            self.config,
            'pg_locks'
        )

        # System metrics
        send_to_listener(
            results['system_metrics'],
            self.config,
            'system_metrics'
        )

        # Try to flush buffer if circuit is closed
        if not is_circuit_open():
            stats = get_buffer_stats()
            if stats.get('queue_size', 0) > 0:
                sent, remaining = flush_buffer(self.config, max_items=50)
                logger.info(
                    "buffer_flush_attempted",
                    sent=sent,
                    remaining=remaining
                )

    def _handle_shutdown(self, signum, frame):
        """Handle SIGTERM/SIGINT for graceful shutdown."""
        sig_name = signal.Signals(signum).name
        logger.info("shutdown_signal_received", signal=sig_name)
        self.running = False
        self._shutdown_event.set()

    def _handle_reload(self, signum, frame):
        """Handle SIGHUP for configuration reload."""
        logger.info("reload_signal_received")
        # For now, just log - could reload config in future

    def _cleanup(self):
        """Clean up resources on shutdown."""
        logger.info("cleanup_starting")

        # Flush remaining log entries
        if self._log_collector.count() > 0:
            self._send_log_entries()

        # Close connection pool
        try:
            close_pool()
        except Exception as e:
            logger.error("pool_close_failed", error=str(e))

        # Close buffer
        try:
            close_buffer()
        except Exception as e:
            logger.error("buffer_close_failed", error=str(e))

        logger.info("cleanup_complete")

    def stop(self):
        """Stop the agent gracefully."""
        logger.info("agent_stopping")
        self.running = False
        self._shutdown_event.set()
        self._cleanup()


def main(config_path: Optional[str] = None):
    """
    Main entry point.

    Args:
        config_path: Path to configuration file (optional)
    """
    # Configure structured logging
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True
    )

    logger.info("postgres_agent_starting", version="1.0.0")

    # Load configuration
    config = load_config(config_path)

    # Validate required settings
    if not config.listener_api_key:
        logger.error("listener_api_key_required")
        sys.exit(1)

    # Start agent
    agent = PostgresMonitoringAgent(config)

    try:
        agent.start()
    except KeyboardInterrupt:
        logger.info("keyboard_interrupt")
    except Exception as e:
        logger.error("agent_failed", error=str(e))
        sys.exit(1)
    finally:
        agent.stop()

    logger.info("postgres_agent_stopped")
