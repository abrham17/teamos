from django.urls import path

from .views import BillingReconcileView, BillingWebhookView, CreateCheckoutSessionView

urlpatterns = [
    path("<uuid:team_id>/checkout-session/", CreateCheckoutSessionView.as_view(), name="billing-checkout-session"),
    path("webhook/<str:provider_name>/", BillingWebhookView.as_view(), name="billing-webhook"),
    path("reconcile/", BillingReconcileView.as_view(), name="billing-reconcile"),
]
