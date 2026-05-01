from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_invites_hardening_and_audit"),
    ]

    operations = [
        migrations.AddField(
            model_name="team",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="team",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="team",
            name="purge_after",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="teamauditevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("invite_created", "Invite Created"),
                    ("invite_sent", "Invite Sent"),
                    ("invite_send_failed", "Invite Send Failed"),
                    ("invite_accepted", "Invite Accepted"),
                    ("invite_revoked", "Invite Revoked"),
                    ("ownership_transferred", "Ownership Transferred"),
                    ("team_soft_deleted", "Team Soft Deleted"),
                    ("team_hard_deleted", "Team Hard Deleted"),
                ],
                max_length=40,
            ),
        ),
    ]
