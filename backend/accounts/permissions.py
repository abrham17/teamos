from __future__ import annotations

from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.team_access import get_team_membership, has_minimum_role


def _resolve_team_id(view, request):
    return view.kwargs.get("team_id") or request.data.get("team_id") or request.query_params.get("team_id")


class IsTeamMember(BasePermission):
    """
    Allows access only to authenticated members of the requested team.
    """

    message = "You are not a member of this team."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        team_id = _resolve_team_id(view, request)
        if not team_id:
            return True

        membership = get_team_membership(request.user, team_id)
        if not membership:
            return False

        request.team_membership = membership
        return True


class CanEditWiki(BasePermission):
    """
    Read allowed for members, write allowed for editor/owner.
    """

    message = "Editor or owner role required."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        team_id = _resolve_team_id(view, request)
        if not team_id:
            return True

        membership = getattr(request, "team_membership", None) or get_team_membership(request.user, team_id)
        if not membership:
            return False

        request.team_membership = membership
        if request.method in SAFE_METHODS:
            return True
        return has_minimum_role(membership, "editor")


class CanIngest(BasePermission):
    """
    Ingestion endpoints are team-scoped and require editor/owner role.
    """

    message = "Ingestion requires editor or owner role."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        team_id = _resolve_team_id(view, request)
        if not team_id:
            return False

        membership = getattr(request, "team_membership", None) or get_team_membership(request.user, team_id)
        if not membership:
            return False

        request.team_membership = membership
        return has_minimum_role(membership, "editor")
