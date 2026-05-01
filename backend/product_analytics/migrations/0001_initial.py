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
            name="ProductEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("event_name", models.CharField(choices=[("workspace_created", "Workspace Created"), ("first_page_created", "First Page Created"), ("first_ingest_completed", "First Ingest Completed"), ("first_chat_answer_received", "First Chat Answer Received"), ("invite_sent", "Invite Sent"), ("invite_accepted", "Invite Accepted"), ("upgrade_clicked", "Upgrade Clicked"), ("subscription_started", "Subscription Started")], max_length=80)),
                ("properties", models.JSONField(blank=True, default=dict)),
                ("occurred_at", models.DateTimeField(auto_now_add=True)),
                ("team", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="product_events", to="accounts.team")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="product_events", to="accounts.user")),
            ],
            options={
                "ordering": ["-occurred_at"],
            },
        ),
    ]
