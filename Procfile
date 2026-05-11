web: PYTHONPATH=backend daphne -b 0.0.0.0 -p $PORT teamos_project.asgi:application
worker: PYTHONPATH=backend celery -A teamos_project worker --concurrency=4 -l info
release: PYTHONPATH=backend python manage.py migrate
