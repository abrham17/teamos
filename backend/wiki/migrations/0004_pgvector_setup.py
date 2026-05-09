from django.db import migrations
from pgvector.django import VectorExtension


class Migration(migrations.Migration):

    dependencies = [
        ('wiki', '0003_wikipage_project'),
    ]

    operations = [
        VectorExtension(),
    ]
