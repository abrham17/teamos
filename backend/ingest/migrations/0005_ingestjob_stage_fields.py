from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ingest", "0004_asyncdeadletter"),
    ]

    operations = [
        migrations.AddField(
            model_name="ingestjob",
            name="ingest_stage",
            field=models.CharField(
                choices=[
                    ("queued", "Queued"),
                    ("extracting", "Extracting"),
                    ("governance", "Governance"),
                    ("materializing", "Materializing"),
                    ("vectorizing", "Vectorizing"),
                    ("graph_sync", "Graph Sync"),
                    ("completed", "Completed"),
                    ("failed", "Failed"),
                ],
                default="queued",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="ingestjob",
            name="ingest_stage_detail",
            field=models.CharField(blank=True, max_length=200),
        ),
    ]
