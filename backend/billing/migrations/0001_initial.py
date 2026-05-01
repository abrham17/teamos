from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("accounts", "0003_invites_hardening_and_audit"),
    ]

    operations = [
        migrations.CreateModel(
            name="TeamSubscription",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("provider", models.CharField(default="paddle", max_length=40)),
                ("external_customer_id", models.CharField(blank=True, max_length=200)),
                ("external_subscription_id", models.CharField(blank=True, max_length=200)),
                ("plan_key", models.CharField(default="free", max_length=60)),
                ("status", models.CharField(choices=[("trialing", "Trialing"), ("active", "Active"), ("past_due", "Past Due"), ("canceled", "Canceled"), ("incomplete", "Incomplete")], default="trialing", max_length=30)),
                ("current_period_end", models.DateTimeField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("team", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="subscription", to="accounts.team")),
            ],
        ),
        migrations.CreateModel(
            name="BillingWebhookEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("provider", models.CharField(max_length=40)),
                ("event_id", models.CharField(max_length=200)),
                ("event_type", models.CharField(max_length=120)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("processed", models.BooleanField(default=False)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("error", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("provider", "event_id")},
            },
        ),
    ]
