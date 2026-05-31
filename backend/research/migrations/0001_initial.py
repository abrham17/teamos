from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("accounts", "0006_team_plan_auto_apply_safe"),
    ]

    operations = [
        migrations.CreateModel(
            name="TeamResearchQuota",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("searches_this_month", models.PositiveIntegerField(default=0)),
                ("max_searches_per_month", models.PositiveIntegerField(default=0)),
                ("last_reset_date", models.DateField(default=django.utils.timezone.localdate)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "team",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="research_quota",
                        to="accounts.team",
                    ),
                ),
            ],
            options={
                "ordering": ["team__name"],
            },
        ),
        migrations.CreateModel(
            name="ResearchLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "action",
                    models.CharField(
                        choices=[("search", "Search"), ("read", "Read"), ("save", "Save")],
                        default="search",
                        max_length=20,
                    ),
                ),
                ("raw_query", models.TextField(blank=True)),
                ("optimized_search_query", models.CharField(blank=True, max_length=512)),
                ("urls_accessed", models.JSONField(blank=True, default=list)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                (
                    "initiated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="research_logs",
                        to="accounts.team",
                    ),
                ),
            ],
            options={
                "ordering": ["-timestamp"],
            },
        ),
        migrations.AddIndex(
            model_name="researchlog",
            index=models.Index(fields=["team", "-timestamp"], name="researchlo_team_id_8c03d9_idx"),
        ),
        migrations.AddIndex(
            model_name="researchlog",
            index=models.Index(fields=["action", "-timestamp"], name="researchlo_action_c7aab8_idx"),
        ),
    ]

