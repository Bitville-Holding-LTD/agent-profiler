"""
PostgreSQL log file parser.

Continuously reads and parses Postgres log files with log rotation handling.
Extracts query logs, errors, and slow queries.

PG-03: Parse Postgres log files continuously for query logs
"""
import os
import re
import time
from typing import Any, Generator, Optional
from datetime import datetime
import structlog

logger = structlog.get_logger()

# PostgreSQL log line patterns (common log_line_prefix formats)
# Format: timestamp [pid] level: message
LOG_LINE_PATTERN = re.compile(
    r'^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)'
    r'(?:\s+\w+)?'  # timezone
    r'\s+\[(?P<pid>\d+)\]'
    r'(?:\s+\[(?P<user>\w+)\])?'
    r'(?:\s+\[(?P<db>\w+)\])?'
    r'\s+(?P<level>\w+):\s+'
    r'(?P<message>.*)'
)

# Alternative simpler format
LOG_LINE_SIMPLE = re.compile(
    r'^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'
    r'.*?\[(?P<pid>\d+)\]'
    r'.*?(?P<level>LOG|ERROR|WARNING|FATAL|PANIC|DEBUG|INFO|NOTICE):\s+'
    r'(?P<message>.*)'
)

# Duration pattern for slow query detection
DURATION_PATTERN = re.compile(r'duration:\s+([\d.]+)\s+ms')

# Statement pattern
STATEMENT_PATTERN = re.compile(r'statement:\s+(.+)', re.DOTALL)


def parse_log_line(line: str) -> Optional[dict[str, Any]]:
    """
    Parse a single PostgreSQL log line.

    Handles multiple log_line_prefix formats.

    Args:
        line: Raw log line string

    Returns:
        Dict with parsed fields or None if not a valid log line
    """
    line = line.strip()
    if not line:
        return None

    # Try primary pattern
    match = LOG_LINE_PATTERN.match(line)
    if not match:
        # Try simpler pattern
        match = LOG_LINE_SIMPLE.match(line)

    if not match:
        return None

    result = {
        'timestamp': match.group('timestamp'),
        'pid': int(match.group('pid')),
        'level': match.group('level'),
        'message': match.group('message'),
    }

    # Add optional fields if present
    if 'user' in match.groupdict() and match.group('user'):
        result['user'] = match.group('user')
    if 'db' in match.groupdict() and match.group('db'):
        result['database'] = match.group('db')

    # Extract duration if present (slow query log)
    duration_match = DURATION_PATTERN.search(result['message'])
    if duration_match:
        result['duration_ms'] = float(duration_match.group(1))

    # Extract SQL statement if present
    statement_match = STATEMENT_PATTERN.search(result['message'])
    if statement_match:
        result['statement'] = statement_match.group(1).strip()
        # Truncate very long statements
        if len(result['statement']) > 2000:
            result['statement'] = result['statement'][:2000] + '...[truncated]'

    return result


def tail_postgres_log(
    log_path: str,
    poll_interval: float = 0.1
) -> Generator[dict[str, Any], None, None]:
    """
    Continuously tail PostgreSQL log file.

    Handles log rotation by detecting inode changes.
    Buffers multi-line log entries before yielding.

    Args:
        log_path: Path to PostgreSQL log file
        poll_interval: Seconds to wait when no new data (default: 0.1s)

    Yields:
        Parsed log entry dicts
    """
    logger.info("starting_log_tail", path=log_path)

    # Wait for file to exist
    while not os.path.exists(log_path):
        logger.warning("log_file_not_found", path=log_path)
        time.sleep(5)

    # Open file and seek to end
    f = open(log_path, 'r', encoding='utf-8', errors='replace')
    f.seek(0, os.SEEK_END)
    last_inode = os.fstat(f.fileno()).st_ino

    # Buffer for multi-line entries
    line_buffer: list[str] = []
    timestamp_pattern = re.compile(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}')

    while True:
        try:
            line = f.readline()

            if line:
                # Check if this is a new log entry (starts with timestamp)
                if timestamp_pattern.match(line) and line_buffer:
                    # Yield the previous buffered entry
                    full_line = ''.join(line_buffer)
                    parsed = parse_log_line(full_line)
                    if parsed:
                        yield parsed
                    line_buffer = []

                line_buffer.append(line)

            else:
                # No new data, check for log rotation
                try:
                    current_inode = os.stat(log_path).st_ino
                    if current_inode != last_inode:
                        logger.info("log_rotation_detected", path=log_path)
                        # Yield any remaining buffered content
                        if line_buffer:
                            full_line = ''.join(line_buffer)
                            parsed = parse_log_line(full_line)
                            if parsed:
                                yield parsed
                            line_buffer = []

                        # Reopen file
                        f.close()
                        f = open(log_path, 'r', encoding='utf-8', errors='replace')
                        last_inode = current_inode

                except FileNotFoundError:
                    # File deleted during rotation, wait for new file
                    logger.warning("log_file_deleted", path=log_path)
                    f.close()
                    time.sleep(1)
                    while not os.path.exists(log_path):
                        time.sleep(1)
                    f = open(log_path, 'r', encoding='utf-8', errors='replace')
                    last_inode = os.fstat(f.fileno()).st_ino

                time.sleep(poll_interval)

        except Exception as e:
            logger.error("log_tail_error", error=str(e))
            time.sleep(1)


class LogCollector:
    """
    Buffered log collector for batch processing.

    Collects log entries until flushed, returning all accumulated entries.
    """

    def __init__(self, max_entries: int = 1000):
        """
        Initialize collector.

        Args:
            max_entries: Maximum entries to buffer before auto-flush
        """
        self.max_entries = max_entries
        self._entries: list[dict[str, Any]] = []

    def add(self, entry: dict[str, Any]) -> bool:
        """
        Add log entry to buffer.

        Args:
            entry: Parsed log entry

        Returns:
            True if buffer is full (should flush)
        """
        self._entries.append(entry)
        return len(self._entries) >= self.max_entries

    def flush(self) -> list[dict[str, Any]]:
        """
        Get and clear all buffered entries.

        Returns:
            List of buffered entries
        """
        entries = self._entries
        self._entries = []
        return entries

    def count(self) -> int:
        """Get current buffer size."""
        return len(self._entries)
