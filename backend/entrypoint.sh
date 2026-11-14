#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL database to be reachable..."
python - << 'EOF'
import socket
import time
import os

host = os.environ.get('POSTGRES_HOST', 'db')
port = int(os.environ.get('POSTGRES_PORT', 5432))

for _ in range(60):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.0)
        s.connect((host, port))
        s.close()
        print(f"==> PostgreSQL reachable at {host}:{port}")
        break
    except Exception:
        time.sleep(1)
else:
    print(f"==> ERROR: Timeout connecting to PostgreSQL at {host}:{port}")
    exit(1)
EOF

echo "==> Running database migrations..."
python manage.py migrate --noinput

echo "==> Seeding standard demo accounts & resources..."
python manage.py seed_demo_users
python manage.py seed_resources

echo "==> Starting Gunicorn Application Server..."
exec "$@"
