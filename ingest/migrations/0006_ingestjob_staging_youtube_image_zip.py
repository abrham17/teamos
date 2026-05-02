# Generated manually for OSS ingest hardening

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ingest", "0005_ingestjob_stage_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="ingestjob",
            name="staging_file",
            field=models.FileField(
                blank=True,
                help_text="Temporary binary upload (PDF, DOCX, image, zip); deleted after extract.",
                null=True,
                upload_to="ingest_staging/%Y/%m/",
            ),
        ),
        migrations.AddField(
            model_name="ingestjob",
            name="source_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name="ingestjob",
            name="source_type",
            field=models.CharField(
                choices=[
                    ("url", "URL"),
                    ("pdf", "PDF"),
                    ("docx", "DOCX"),
                    ("markdown", "Markdown"),
                    ("repo", "Repository"),
                    ("youtube", "YouTube"),
                    ("image", "Image (OCR)"),
                    ("code_zip", "Code zip"),
                ],
                max_length=32,
            ),
        ),
    ]
