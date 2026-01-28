"""
System metrics collector using psutil.

Collects CPU, memory, and disk I/O metrics from the database server.

PG-04: Collect system metrics (CPU, RAM, disk I/O) on DB server
"""
from typing import Any
import psutil
import structlog

logger = structlog.get_logger()


def collect_system_metrics() -> dict[str, Any]:
    """
    Collect system metrics using psutil.

    Returns CPU, memory, disk I/O, and network I/O metrics.

    Args:
        None

    Returns:
        Dict with system metrics
    """
    try:
        # CPU - use interval=1 for accurate percentage
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_count = psutil.cpu_count()
        cpu_count_logical = psutil.cpu_count(logical=True)

        # Load average (Unix only)
        try:
            load_avg = psutil.getloadavg()
        except (AttributeError, OSError):
            load_avg = (0, 0, 0)

        # Memory
        mem = psutil.virtual_memory()

        # Swap
        swap = psutil.swap_memory()

        # Disk I/O
        try:
            disk_io = psutil.disk_io_counters()
            disk_metrics = {
                'read_count': disk_io.read_count,
                'write_count': disk_io.write_count,
                'read_bytes': disk_io.read_bytes,
                'write_bytes': disk_io.write_bytes,
                'read_time_ms': disk_io.read_time,
                'write_time_ms': disk_io.write_time,
            } if disk_io else {}
        except Exception:
            disk_metrics = {}

        # Network I/O
        try:
            net_io = psutil.net_io_counters()
            network_metrics = {
                'bytes_sent': net_io.bytes_sent,
                'bytes_recv': net_io.bytes_recv,
                'packets_sent': net_io.packets_sent,
                'packets_recv': net_io.packets_recv,
                'errin': net_io.errin,
                'errout': net_io.errout,
                'dropin': net_io.dropin,
                'dropout': net_io.dropout,
            }
        except Exception:
            network_metrics = {}

        # Disk usage for common PostgreSQL paths
        disk_usage = {}
        for path in ['/var/lib/postgresql', '/var/log/postgresql', '/']:
            try:
                usage = psutil.disk_usage(path)
                disk_usage[path] = {
                    'total': usage.total,
                    'used': usage.used,
                    'free': usage.free,
                    'percent': usage.percent,
                }
            except (FileNotFoundError, PermissionError):
                pass

        result = {
            'cpu': {
                'percent': cpu_percent,
                'count_physical': cpu_count,
                'count_logical': cpu_count_logical,
                'load_avg_1m': load_avg[0],
                'load_avg_5m': load_avg[1],
                'load_avg_15m': load_avg[2],
            },
            'memory': {
                'total': mem.total,
                'available': mem.available,
                'used': mem.used,
                'percent': mem.percent,
                'buffers': getattr(mem, 'buffers', 0),
                'cached': getattr(mem, 'cached', 0),
            },
            'swap': {
                'total': swap.total,
                'used': swap.used,
                'free': swap.free,
                'percent': swap.percent,
            },
            'disk_io': disk_metrics,
            'network_io': network_metrics,
            'disk_usage': disk_usage,
        }

        logger.debug(
            "system_metrics_collected",
            cpu_percent=cpu_percent,
            memory_percent=mem.percent,
            load_1m=load_avg[0]
        )

        return result

    except Exception as e:
        logger.error("system_metrics_collection_failed", error=str(e))
        return {
            'error': str(e),
            'cpu': {},
            'memory': {},
            'swap': {},
            'disk_io': {},
            'network_io': {},
            'disk_usage': {},
        }
