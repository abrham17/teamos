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
            name="ExportEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("export_type", models.CharField(choices=[("wiki_zip", "Wiki Zip"), ("page_markdown", "Page Markdown")], max_length=30)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("team", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="export_events", to="accounts.team")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="export_events", to="accounts.user")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
