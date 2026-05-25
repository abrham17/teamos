# Generated manually for Safe Plan Updates

import uuid

import django.db.models.deletion
import pgvector.django
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("planning", "0008_project_related_wiki_pages"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="semantic_key",
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name="task",
            name="title_embedding",
            field=pgvector.django.VectorField(blank=True, dimensions=1536, null=True),
        ),
        migrations.AddField(
            model_name="task",
            name="human_locked_fields",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Map of field name -> ISO timestamp when a human locked the field from AI overwrites.",
            ),
        ),
        migrations.AddField(
            model_name="milestone",
            name="semantic_key",
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name="milestone",
            name="human_locked_fields",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.CreateModel(
            name="PlanVersion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("snapshot_data", models.JSONField(help_text="ProjectDetailSerializer-shaped JSON")),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("manual", "Manual"),
                            ("agent_proposal", "Agent Proposal"),
                            ("agent_applied", "Agent Applied"),
                            ("auto", "Auto"),
                        ],
                        default="auto",
                        max_length=32,
                    ),
                ),
                ("prompt_hash", models.CharField(blank=True, max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_plan_versions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "parent_version",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="child_versions",
                        to="planning.planversion",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="plan_versions",
                        to="planning.project",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PlanChangeSet",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                            ("partially_applied", "Partially Applied"),
                        ],
                        default="pending",
                        max_length=24,
                    ),
                ),
                ("mutations", models.JSONField(default=list)),
                ("impact_summary", models.JSONField(default=dict)),
                ("auto_applied", models.JSONField(default=list)),
                ("pending_mutations", models.JSONField(default=list)),
                ("remediation_preview", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "base_version",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="changesets_as_base",
                        to="planning.planversion",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_plan_changesets",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="plan_changesets",
                        to="planning.project",
                    ),
                ),
                (
                    "proposed_version",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="changesets_as_proposal",
                        to="planning.planversion",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PlanEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "entity_type",
                    models.CharField(
                        choices=[
                            ("task", "Task"),
                            ("milestone", "Milestone"),
                            ("project", "Project"),
                            ("dependency", "Dependency"),
                        ],
                        max_length=20,
                    ),
                ),
                ("entity_id", models.UUIDField(blank=True, null=True)),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("task_created", "Task Created"),
                            ("task_updated", "Task Updated"),
                            ("task_deleted", "Task Deleted"),
                            ("milestone_created", "Milestone Created"),
                            ("milestone_updated", "Milestone Updated"),
                            ("milestone_deleted", "Milestone Deleted"),
                            ("project_updated", "Project Updated"),
                            ("dependency_changed", "Dependency Changed"),
                        ],
                        max_length=32,
                    ),
                ),
                ("payload", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="plan_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "changeset",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="events",
                        to="planning.planchangeset",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="plan_events",
                        to="planning.project",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="task",
            constraint=models.UniqueConstraint(
                condition=models.Q(("semantic_key", ""), _negated=True),
                fields=("project", "semantic_key"),
                name="unique_task_semantic_key_per_project",
            ),
        ),
        migrations.AddConstraint(
            model_name="milestone",
            constraint=models.UniqueConstraint(
                condition=models.Q(("semantic_key", ""), _negated=True),
                fields=("project", "semantic_key"),
                name="unique_milestone_semantic_key_per_project",
            ),
        ),
    ]
