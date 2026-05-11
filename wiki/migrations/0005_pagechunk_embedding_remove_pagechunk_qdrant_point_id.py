from django.db import migrations, models
import pgvector.django


class Migration(migrations.Migration):

    dependencies = [
        ('wiki', '0004_pgvector_setup'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='pagechunk',
            name='qdrant_point_id',
        ),
        migrations.AddField(
            model_name='pagechunk',
            name='embedding',
            field=pgvector.django.VectorField(blank=True, dimensions=1536, null=True),
        ),
    ]
