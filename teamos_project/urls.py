from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/wiki/", include("wiki.urls")),
    path("api/graph/", include("graph_engine.urls")),
    path("api/chat/", include("chat.urls")),
    path("api/ingest/", include("ingest.urls")),
    path("api/export/", include("export_app.urls")),
]
