from django.urls import path
from integrations.views import (
    IntegrationProvidersView, IntegrationListView, IntegrationConnectView,
    IntegrationCallbackView, IntegrationDisconnectView,
    IntegrationToolsView, IntegrationAuditLogsView, IntegrationProviderSearchView,
)

urlpatterns = [
    path("providers/", IntegrationProvidersView.as_view()),
    path("", IntegrationListView.as_view()),
    path("connect/", IntegrationConnectView.as_view()),
    path("callback/", IntegrationCallbackView.as_view()),
    path("<str:provider>/disconnect/", IntegrationDisconnectView.as_view()),
    path("<str:provider>/search/", IntegrationProviderSearchView.as_view()),
    path("tools/", IntegrationToolsView.as_view()),
    path("logs/", IntegrationAuditLogsView.as_view()),
]
