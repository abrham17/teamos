from django.urls import path
from .views import (
    WikiPageListView, WikiPageDetailView,
    WikiBacklinksView, WikiUnlinkedMentionsView,
    WikiSearchView, WikiRecentView, PageTemplateListView,
)

urlpatterns = [
    # Pages
    path("<uuid:team_id>/pages/", WikiPageListView.as_view()),
    path("<uuid:team_id>/pages/<slug:slug>/", WikiPageDetailView.as_view()),
    path("<uuid:team_id>/pages/<slug:slug>/backlinks/", WikiBacklinksView.as_view()),
    path("<uuid:team_id>/pages/<slug:slug>/unlinked/", WikiUnlinkedMentionsView.as_view()),
    # Search & Recent
    path("<uuid:team_id>/search/", WikiSearchView.as_view()),
    path("<uuid:team_id>/recent/", WikiRecentView.as_view()),
    # Templates
    path("<uuid:team_id>/templates/", PageTemplateListView.as_view()),
]
