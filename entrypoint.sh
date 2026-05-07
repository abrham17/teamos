#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting TeamOS Backend Entrypoint..."

# 1. Run database migrations
echo "Applying database migrations..."
python manage.py migrate --noinput

# 2. Execute the CMD from the Dockerfile (starts the server)
echo "Starting server..."
exec "$@"
