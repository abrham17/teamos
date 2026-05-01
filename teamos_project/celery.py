import os

from celery import Celery

# Match manage.py default for local development.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "teamos_project.settings.development")

app = Celery("teamos_project")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
