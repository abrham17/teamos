import os
from dataclasses import dataclass

from django.db.models import Sum
from django.utils import timezone

from accounts.models import TeamInvite, TeamMember
from chat.models import ChatTokenUsage
from export_app.models import ExportEvent
from ingest.models import IngestJob
from wiki.models import WikiPage


@dataclass(frozen=True)
class QuotaCheckResult:
    allowed: bool
    capability: str
    limit: int
    used: int
    plan: str

    @property
    def remaining(self) -> int:
        return max(self.limit - self.used, 0)

    def to_details(self) -> dict:
        return {
            "capability": self.capability,
            "plan": self.plan,
            "limit": self.limit,
            "used": self.used,
            "remaining": self.remaining,
            "upgrade_cta": "Upgrade your team plan to continue.",
        }


PLAN_LIMITS = {
    "free": {
        "wiki_page_create": 10,
        "ingest_job_create": 10,
        "export_job_create": 10,
        "seat_manage": 10,
        "token_consume": 5000,
    },
    "team": {
        "wiki_page_create": 200,
        "ingest_job_create": 500,
        "export_job_create": 200,
        "seat_manage": 25,
        "token_consume": 500000,
    },
    "pro": {
        "wiki_page_create": 2000,
        "ingest_job_create": 5000,
        "export_job_create": 2000,
        "seat_manage": 250,
        "token_consume": 5000000,
    },
    "enterprise": {
        "wiki_page_create": 20000,
        "ingest_job_create": 50000,
        "export_job_create": 20000,
        "seat_manage": 2000,
        "token_consume": 50000000,
    },
}


def _resolve_plan_limits(plan: str) -> dict:
    resolved = dict(PLAN_LIMITS.get(plan, PLAN_LIMITS["free"]))

    # Local-dev override to avoid constant 402 responses while testing flows.
    if plan == "free":
        free_wiki_limit = os.environ.get("FREE_PLAN_WIKI_PAGE_LIMIT")
        if free_wiki_limit:
            try:
                resolved["wiki_page_create"] = int(free_wiki_limit)
            except ValueError:
                pass

    return resolved


def check_quota(team, capability: str) -> QuotaCheckResult:
    limits = _resolve_plan_limits(team.plan)
    limit = int(limits.get(capability, 0))
    if capability == "wiki_page_create":
        used = WikiPage.objects.filter(team=team, is_deleted=False).count()
    elif capability == "ingest_job_create":
        used = IngestJob.objects.filter(team=team).count()
    elif capability == "export_job_create":
        used = ExportEvent.objects.filter(team=team).count()
    elif capability == "seat_manage":
        active_invites = TeamInvite.objects.filter(
            team=team,
            used_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).count()
        used = TeamMember.objects.filter(team=team).count() + active_invites
    elif capability == "token_consume":
        used = (
            ChatTokenUsage.objects.filter(team=team).aggregate(total=Sum("total_tokens")).get("total")
            or 0
        )
    else:
        used = 0
    return QuotaCheckResult(
        allowed=used < limit,
        capability=capability,
        limit=limit,
        used=used,
        plan=team.plan,
    )
