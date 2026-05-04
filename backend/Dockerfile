# Base Image
FROM python:3.11-slim

# Build-time Metadata
LABEL maintainer="TeamOS Core Team"

# Environment Variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV APP_HOME=/app
ENV DJANGO_SETTINGS_MODULE=teamos_project.settings.production

# Create working directory
WORKDIR $APP_HOME

# Install System Dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python Dependencies
COPY requirements.txt $APP_HOME/
RUN pip install --no-cache-dir -r requirements.txt

# Copy Project Code
COPY . $APP_HOME/

# Collect Static Files
RUN python manage.py collectstatic --noinput

# Expose Port
EXPOSE 8000

# Default Command (Start Daphne for ASGI support)
CMD daphne -b 0.0.0.0 -p ${PORT:-8000} teamos_project.asgi:application
