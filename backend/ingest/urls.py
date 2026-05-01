from django.urls import path
from rest_framework.views import APIView
from rest_framework.response import Response

from . import views

urlpatterns = [
    path("<uuid:team_id>/jobs/", views.IngestJobListView.as_view()),
    path("<uuid:team_id>/url/", views.UrlIngestView.as_view()),
    path("<uuid:team_id>/file/", views.FileIngestView.as_view()),
]
