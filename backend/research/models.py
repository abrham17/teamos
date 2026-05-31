from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from accounts.models import Team


def _plan_default_quota(team: Team) -> int:
    plan = getattr(getattr(team, "subscription", None), "plan_key", None) or getattr(team, "plan", "free")
    quota_map = getattr(settings, "RESEARCH_MONTHLY_QUOTAS", {})
    try:
        return int(quota_map.get(plan, quota_map.get("free", 0)) or 0)
    except (TypeError, ValueError):
        return 0


@dataclass(frozen=True)
class ResearchQuotaState:
    limit: int
    current: int
    remaining: int
    reason: str | None = None


class TeamResearchQuota(models.Model):
    team = models.OneToOneField(Team, on_delete=models.CASCADE, related_name="research_quota")
    searches_this_month = models.PositiveIntegerField(default=0)
    max_searches_per_month = models.PositiveIntegerField(default=0)
    last_reset_date = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["team__name"]

    def __str__(self) -> str:
        return f"ResearchQuota({self.team.name}: {self.searches_this_month}/{self.effective_limit()})"

    def effective_limit(self) -> int:
        limit = int(self.max_searches_per_month or 0)
        return limit if limit > 0 else _plan_default_quota(self.team)

    def reset_if_needed(self, today=None) -> bool:
        today = today or timezone.localdate()
        if not self.last_reset_date or (self.last_reset_date.year, self.last_reset_date.month) != (today.year, today.month):
            self.searches_this_month = 0
            self.last_reset_date = today
            return True
        return False

    def remaining_searches(self) -> int:
        return max(0, self.effective_limit() - self.searches_this_month)

    def to_state(self) -> ResearchQuotaState:
        limit = self.effective_limit()
        current = int(self.searches_this_month)
        return ResearchQuotaState(
            limit=limit,
            current=current,
            remaining=max(0, limit - current),
        )

    @classmethod
    def get_state(cls, team: Team) -> ResearchQuotaState:
        quota = cls.objects.filter(team=team).first()
        if quota is None:
            limit = _plan_default_quota(team)
            return ResearchQuotaState(limit=limit, current=0, remaining=max(0, limit))
        if quota.last_reset_date and quota.last_reset_date.month != timezone.localdate().month:
            limit = quota.effective_limit()
            return ResearchQuotaState(limit=limit, current=0, remaining=max(0, limit))
        return quota.to_state()

    @classmethod
    def consume_search(cls, team: Team, amount: int = 1) -> tuple[bool, "TeamResearchQuota", ResearchQuotaState]:
        with transaction.atomic():
            quota, _ = cls.objects.select_for_update().get_or_create(
                team=team,
                defaults={
                    "max_searches_per_month": _plan_default_quota(team),
                    "searches_this_month": 0,
                    "last_reset_date": timezone.localdate(),
                },
            )
            quota.reset_if_needed()
            limit = quota.effective_limit()
            state = quota.to_state()
            if limit <= 0 or quota.searches_this_month + amount > limit:
                return False, quota, state
            quota.searches_this_month += amount
            quota.save(update_fields=["searches_this_month", "last_reset_date", "updated_at"])
            return True, quota, quota.to_state()


class ResearchLog(models.Model):
    ACTION_CHOICES = [
        ("search", "Search"),
        ("read", "Read"),
        ("save", "Save"),
    ]

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="research_logs")
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, default="search")
    raw_query = models.TextField(blank=True)
    optimized_search_query = models.CharField(max_length=512, blank=True)
    urls_accessed = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["team", "-timestamp"]),
            models.Index(fields=["action", "-timestamp"]),
        ]

    def __str__(self) -> str:
        return f"ResearchLog({self.team.name}: {self.action})"

