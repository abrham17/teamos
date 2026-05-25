# Generated manually for Safe Plan Updates

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_team_plan_enterprise"),
    ]

    operations = [
        migrations.AddField(
            model_name="team",
            name="plan_auto_apply_safe",
            field=models.BooleanField(
                default=True,
                help_text="When true, AI manage-mode updates auto-apply safe fields (e.g. descriptions).",
            ),
        ),
    ]
