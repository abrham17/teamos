from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/wiki/", include("wiki.urls")),
    path("api/graph/", include("graph_engine.urls")),
    path("api/chat/", include("chat.urls")),
    path("api/ingest/", include("ingest.urls")),
    path("api/export/", include("export_app.urls")),
    path("api/billing/", include("billing.urls")),
    path("api/analytics/", include("product_analytics.urls")),
    path("api/admin/", include("admin_api.urls")),
    path("api/integrations/", include("integrations.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
