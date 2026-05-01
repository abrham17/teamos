import uuid
from django.core.management.base import BaseCommand
from accounts.models import User, Team, TeamMember
from wiki.models import WikiPage
from rest_framework_simplejwt.tokens import RefreshToken

class Command(BaseCommand):
    help = 'Seeds a default dev user and team for local testing'

    def handle(self, *args, **options):
        email = 'abrhamhabtom17@gmail.com'
        password = 'chuchu2255'

        # Create or update user
        user, created = User.objects.get_or_create(email=email)
        user.set_password(password)
        user.first_name = 'Dev'
        user.last_name = 'User'
        user.is_staff = True
        user.is_superuser = True
        user.save()

        self.stdout.write(self.style.SUCCESS(f'{"Created" if created else "Updated"} user: {email} / {password}'))

        # Create team
        team, created = Team.objects.get_or_create(name='Dev Team')
        TeamMember.objects.get_or_create(user=user, team=team, defaults={'role': 'owner'})
        
        self.stdout.write(self.style.SUCCESS(f'Assigned to Team: {team.name} ({team.id})'))

        # Create sample pages if none exist
        if not WikiPage.objects.filter(team=team).exists():
            WikiPage.objects.create(
                team=team,
                title="Welcome to TeamOS",
                slug="welcome",
                content="This is your first page in the team wiki. You can edit it or create new ones.",
                page_type="doc",
                created_by=user
            )
            WikiPage.objects.create(
                team=team,
                title="Project Architecture",
                slug="architecture",
                content="We are using Django and Next.js.",
                page_type="doc",
                created_by=user
            )
            self.stdout.write(self.style.SUCCESS('Created default wiki pages.'))

        # Generate JWT Tokens
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)

        self.stdout.write(self.style.WARNING('\n--- JWT Tokens for API Testing ---'))
        self.stdout.write(f'Access: {access}')
        self.stdout.write(f'Refresh: {str(refresh)}')
        self.stdout.write(self.style.WARNING('----------------------------------\n'))
