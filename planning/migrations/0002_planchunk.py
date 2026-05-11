from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("planning", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlanChunk",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("chunk_index", models.PositiveIntegerField()),
                (
                    "source_kind",
                    models.CharField(
                        choices=[("project", "Project"), ("task", "Task"), ("milestone", "Milestone")], max_length=20
                    ),
                ),
                ("source_ref_id", models.UUIDField(blank=True, null=True)),
                ("title", models.CharField(max_length=300)),
                ("content", models.TextField()),
                ("content_hash", models.CharField(db_index=True, max_length=64)),
                ("qdrant_point_id", models.CharField(blank=True, max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="chunks",
                        to="planning.project",
                    ),
                ),
            ],
            options={
                "ordering": ["chunk_index"],
                "unique_together": {("project", "chunk_index")},
            },
        ),
    ]
