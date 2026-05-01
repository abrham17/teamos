from django.urls import path
from .views import ChatSessionListView, ChatSessionDetailView, ChatQueryStreamView

urlpatterns = [
    path("<uuid:team_id>/sessions/", ChatSessionListView.as_view()),
    path("<uuid:team_id>/sessions/<uuid:session_id>/", ChatSessionDetailView.as_view()),
    path("<uuid:team_id>/sessions/<uuid:session_id>/query/", ChatQueryStreamView.as_view()),
]
