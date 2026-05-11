from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("ingest", "0003_alter_ingestjob_status_knowledgeactivity_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="AsyncDeadLetter",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("task_name", models.CharField(max_length=200)),
                ("trace_id", models.CharField(db_index=True, max_length=120)),
                ("error_message", models.TextField()),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(choices=[("new", "New"), ("requeued", "Requeued"), ("resolved", "Resolved")], default="new", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
