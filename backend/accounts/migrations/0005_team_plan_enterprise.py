from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_team_soft_delete_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="team",
            name="plan",
            field=models.CharField(
                choices=[
                    ("free", "Free"),
                    ("team", "Team"),
                    ("pro", "Pro"),
                    ("enterprise", "Enterprise"),
                ],
                default="free",
                max_length=20,
            ),
        ),
    ]
