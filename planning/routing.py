from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/planning/(?P<team_id>[0-9a-f-]+)/projects/(?P<project_id>[0-9a-f-]+)/$', consumers.PlannerConsumer.as_asgi()),
]
