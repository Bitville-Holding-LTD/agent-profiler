# Bitville APM Configuration Files

## Daemon Process Management

Choose ONE of the following options:

### Option 1: Supervisord (Recommended)

```bash
# Copy configuration
sudo cp supervisord.conf /etc/supervisor/conf.d/bitville-apm-daemon.conf

# Create log directory
sudo mkdir -p /var/log/bitville-apm
sudo chown www-data:www-data /var/log/bitville-apm

# Reload and start
sudo supervisorctl reread
sudo supervisorctl update

# Check status
sudo supervisorctl status bitville-apm-daemon
```

### Option 2: Systemd

```bash
# Copy service file
sudo cp bitville-apm-daemon.service /etc/systemd/system/

# Reload and enable
sudo systemctl daemon-reload
sudo systemctl enable bitville-apm-daemon

# Start
sudo systemctl start bitville-apm-daemon

# Check status
sudo systemctl status bitville-apm-daemon
```

## Prerequisites

Before starting the daemon:

1. Create runtime directories:
```bash
sudo mkdir -p /var/run/bitville-apm
sudo mkdir -p /var/lib/bitville-apm/buffer
sudo mkdir -p /var/lib/bitville-apm/circuit-breaker-state
sudo chown -R www-data:www-data /var/run/bitville-apm /var/lib/bitville-apm
```

2. Install PHP dependencies:
```bash
cd /var/www/project/profiling
composer install
```
