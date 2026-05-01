from django.urls import path
from .views import ExportWikiView, ExportPageView

urlpatterns = [
    path("<uuid:team_id>/wiki/", ExportWikiView.as_view()),
    path("<uuid:team_id>/page/<slug:slug>/", ExportPageView.as_view()),
]
