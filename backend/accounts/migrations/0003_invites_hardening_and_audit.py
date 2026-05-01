from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_user_clerk_user_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="teaminvite",
            name="accepted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="accepted_invites",
                to="accounts.user",
            ),
        ),
        migrations.AddField(
            model_name="teaminvite",
            name="invitee_email",
            field=models.EmailField(default="pending@example.com", max_length=254),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="teaminvite",
            name="revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="teaminvite",
            name="send_status",
            field=models.CharField(
                choices=[("pending", "Pending"), ("sent", "Sent"), ("failed", "Failed")],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="teaminvite",
            name="sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="TeamAuditEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("event_type", models.CharField(choices=[("invite_created", "Invite Created"), ("invite_sent", "Invite Sent"), ("invite_send_failed", "Invite Send Failed"), ("invite_accepted", "Invite Accepted"), ("invite_revoked", "Invite Revoked")], max_length=40)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_actions", to="accounts.user")),
                ("team", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="audit_events", to="accounts.team")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
