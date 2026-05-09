web: daphne -b 0.0.0.0 -p $PORT teamos_project.asgi:application
worker: celery -A teamos_project worker -l info --concurrency=1
release: python manage.py migrate
