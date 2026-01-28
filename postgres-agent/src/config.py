"""
Configuration loader for Postgres monitoring agent.

Supports INI file and environment variable overrides.
Safe defaults that prioritize database safety.
"""
import os
import configparser
from dataclasses import dataclass
from typing import Optional
import structlog

logger = structlog.get_logger()

@dataclass
class Config:
    """Agent configuration with safe defaults."""

    # Database connection
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "postgres"
    db_user: str = "bitville_monitor"
    db_password: str = ""

    # Connection pool safety limits (PG-07)
    pool_min_size: int = 2
    pool_max_size: int = 5  # Never exceed 5 connections
    statement_timeout_ms: int = 5000  # 5 second query timeout
    connection_timeout_s: int = 30  # Connection acquisition timeout

    # Collection intervals
    collection_interval_s: int = 60  # 1 minute (PG-01)

    # Listener configuration (PG-COMM-01)
    listener_url: str = "https://listener:8443/ingest/postgres"
    listener_api_key: str = ""
    listener_timeout_s: int = 5

    # Project identification (PG-COMM-03)
    project_id: str = "default"

    # Buffer configuration (PG-COMM-02)
    buffer_path: str = "/var/lib/bitville-postgres-agent/buffer"
    buffer_max_size_mb: int = 100

    # Log parsing
    postgres_log_path: str = "/var/log/postgresql/postgresql-main.log"

    # Circuit breaker
    circuit_breaker_fail_max: int = 5
    circuit_breaker_timeout_s: int = 60

def load_config(config_path: Optional[str] = None) -> Config:
    """
    Load configuration from INI file and environment variables.

    Priority:
    1. Environment variables (highest)
    2. INI file
    3. Defaults (lowest)

    Environment variable format: BITVILLE_PG_<SETTING_NAME>
    Example: BITVILLE_PG_DB_HOST, BITVILLE_PG_LISTENER_URL
    """
    config = Config()

    # Load from INI file if provided
    if config_path and os.path.exists(config_path):
        parser = configparser.ConfigParser()
        parser.read(config_path)

        if parser.has_section('database'):
            config.db_host = parser.get('database', 'host', fallback=config.db_host)
            config.db_port = parser.getint('database', 'port', fallback=config.db_port)
            config.db_name = parser.get('database', 'name', fallback=config.db_name)
            config.db_user = parser.get('database', 'user', fallback=config.db_user)
            config.db_password = parser.get('database', 'password', fallback=config.db_password)
            config.statement_timeout_ms = parser.getint('database', 'statement_timeout_ms', fallback=config.statement_timeout_ms)

        if parser.has_section('collection'):
            config.collection_interval_s = parser.getint('collection', 'interval_s', fallback=config.collection_interval_s)
            config.postgres_log_path = parser.get('collection', 'log_path', fallback=config.postgres_log_path)

        if parser.has_section('listener'):
            config.listener_url = parser.get('listener', 'url', fallback=config.listener_url)
            config.listener_api_key = parser.get('listener', 'api_key', fallback=config.listener_api_key)
            config.project_id = parser.get('listener', 'project_id', fallback=config.project_id)

        if parser.has_section('buffer'):
            config.buffer_path = parser.get('buffer', 'path', fallback=config.buffer_path)
            config.buffer_max_size_mb = parser.getint('buffer', 'max_size_mb', fallback=config.buffer_max_size_mb)

        logger.info("config_loaded_from_file", path=config_path)

    # Override with environment variables (highest priority)
    env_mappings = {
        'BITVILLE_PG_DB_HOST': ('db_host', str),
        'BITVILLE_PG_DB_PORT': ('db_port', int),
        'BITVILLE_PG_DB_NAME': ('db_name', str),
        'BITVILLE_PG_DB_USER': ('db_user', str),
        'BITVILLE_PG_DB_PASSWORD': ('db_password', str),
        'BITVILLE_PG_STATEMENT_TIMEOUT_MS': ('statement_timeout_ms', int),
        'BITVILLE_PG_COLLECTION_INTERVAL_S': ('collection_interval_s', int),
        'BITVILLE_PG_LISTENER_URL': ('listener_url', str),
        'BITVILLE_PG_LISTENER_API_KEY': ('listener_api_key', str),
        'BITVILLE_PG_PROJECT_ID': ('project_id', str),
        'BITVILLE_PG_BUFFER_PATH': ('buffer_path', str),
        'BITVILLE_PG_LOG_PATH': ('postgres_log_path', str),
    }

    for env_var, (attr, type_fn) in env_mappings.items():
        value = os.environ.get(env_var)
        if value is not None:
            setattr(config, attr, type_fn(value))
            logger.debug("config_override_from_env", var=env_var)

    # Enforce safety limits - pool_max_size MUST NOT exceed 5
    if config.pool_max_size > 5:
        logger.warning("pool_max_size_capped", requested=config.pool_max_size, capped=5)
        config.pool_max_size = 5

    # Enforce statement timeout minimum of 1 second
    if config.statement_timeout_ms < 1000:
        logger.warning("statement_timeout_increased", requested=config.statement_timeout_ms, minimum=1000)
        config.statement_timeout_ms = 1000

    return config
