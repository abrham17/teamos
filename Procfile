web: daphne -b 0.0.0.0 -p $PORT teamos_project.asgi:application
worker: celery -A teamos_project worker -P gevent --concurrency=10 -l info
release: python manage.py migrate
