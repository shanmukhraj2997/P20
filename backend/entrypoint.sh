#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL database to be reachable..."
python - << 'EOF'
import socket
import time
import os
from urllib.parse import urlparse

db_url = os.environ.get('DATABASE_URL')
if db_url:
    try:
        parsed = urlparse(db_url)
        host = parsed.hostname or '127.0.0.1'
        port = parsed.port or 5432
    except Exception:
        host = os.environ.get('POSTGRES_HOST', 'db')
        port = int(os.environ.get('POSTGRES_PORT', 5432))
else:
    host = os.environ.get('POSTGRES_HOST', 'db')
    port = int(os.environ.get('POSTGRES_PORT', 5432))

for i in range(60):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.0)
        s.connect((host, port))
        s.close()
        print(f"==> PostgreSQL reachable at {host}:{port}")
        break
    except Exception as e:
        time.sleep(1)
else:
    print(f"==> WARNING: Could not connect to {host}:{port} within timeout. Proceeding with migrations...")
EOF

echo "==> Collecting static assets..."
python manage.py collectstatic --noinput || true

echo "==> Running database migrations..."
python manage.py migrate --noinput

echo "==> Seeding standard demo accounts & resources..."
python manage.py seed_demo_users || true
python manage.py seed_resources || true

echo "==> Launching Application Server..."
exec "$@"
