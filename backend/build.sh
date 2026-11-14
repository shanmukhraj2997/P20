#!/usr/bin/env bash
# Exit on error
set -o errexit

pip install -r requirements.txt || pip install -r ../requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
python manage.py seed_demo_users
python manage.py seed_resources
