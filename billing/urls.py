from django.urls import path

from .views import (
    BillingPlansCatalogView,
    BillingQuoteView,
    BillingReconcileView,
    BillingWebhookView,
    CreateCheckoutSessionView,
)

urlpatterns = [
    path("plans/", BillingPlansCatalogView.as_view(), name="billing-plans-catalog"),
    path("quote/", BillingQuoteView.as_view(), name="billing-quote"),
    path("<uuid:team_id>/checkout-session/", CreateCheckoutSessionView.as_view(), name="billing-checkout-session"),
    path("webhook/<str:provider_name>/", BillingWebhookView.as_view(), name="billing-webhook"),
    path("reconcile/", BillingReconcileView.as_view(), name="billing-reconcile"),
]
