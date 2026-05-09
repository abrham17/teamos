from django.db import migrations, models
import pgvector.django


class Migration(migrations.Migration):

    dependencies = [
        ('planning', '0004_projectmember'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='planchunk',
            name='qdrant_point_id',
        ),
        migrations.AddField(
            model_name='planchunk',
            name='embedding',
            field=pgvector.django.VectorField(blank=True, dimensions=1536, null=True),
        ),
    ]
