import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'teamos_project.settings')
django.setup()

from accounts.models import Team
from billing.models import TeamSubscription
from django.utils import timezone
from datetime import timedelta

def repair_subscriptions():
    teams_without_sub = Team.objects.filter(subscription__isnull=True)
    print(f"Found {teams_without_sub.count()} teams without subscriptions.")
    
    for team in teams_without_sub:
        TeamSubscription.objects.create(
            team=team,
            plan_key="free",
            status="trialing",
            trial_expires_at=timezone.now() + timedelta(days=60)
        )
        print(f"Created 60-day trial for team: {team.name} ({team.id})")

if __name__ == "__main__":
    repair_subscriptions()
