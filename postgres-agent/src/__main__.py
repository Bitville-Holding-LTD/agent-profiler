"""
Entry point for python -m postgres_agent

Usage:
    python -m postgres_agent [config_path]

Environment variables:
    BITVILLE_PG_CONFIG_PATH - Path to configuration file
    BITVILLE_PG_* - Configuration overrides (see config.py)
"""
import os
import sys

from .daemon import main


if __name__ == "__main__":
    # Get config path from argument or environment
    config_path = None

    if len(sys.argv) > 1:
        config_path = sys.argv[1]
    elif os.environ.get('BITVILLE_PG_CONFIG_PATH'):
        config_path = os.environ['BITVILLE_PG_CONFIG_PATH']

    main(config_path)
