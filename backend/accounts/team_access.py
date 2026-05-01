from __future__ import annotations

from typing import Optional

from accounts.models import TeamMember


ROLE_ORDER = {
    "viewer": 1,
    "editor": 2,
    "owner": 3,
}


def get_team_membership(user, team_id) -> Optional[TeamMember]:
    try:
        return TeamMember.objects.select_related("team").get(user=user, team_id=team_id, team__is_deleted=False)
    except TeamMember.DoesNotExist:
        return None


def has_minimum_role(member: TeamMember, minimum_role: str) -> bool:
    return ROLE_ORDER.get(member.role, 0) >= ROLE_ORDER.get(minimum_role, 0)
