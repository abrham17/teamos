"""
Tool scoping for crew agents.
Each agent role gets a filtered subset of all registered tools,
preventing cross-domain tool access and reducing context noise.
"""

ROLE_TOOL_MAP: dict[str, list[str]] = {
    "researcher": [
        "web_search",
        "wiki_search_pages",
        "wiki_get_page",
        "graph_get_neighbors",
        "graph_find_path",
        "memory_retrieve",
        "ingest_url",
    ],
    "strategic_planner": [
        "wiki_search_pages",
        "graph_get_neighbors",
        "plan_create_project",
        "plan_create_milestone",
        "plan_assess_risk",
        "memory_retrieve",
        "memory_store",
    ],
    "task_manager": [
        "plan_create_task",
        "plan_update_task",
        "plan_assign_member",
        "plan_detect_conflicts",
        "plan_get_project",
        "plan_list_tasks",
    ],
    "risk_critic": [
        "wiki_search_pages",
        "graph_get_neighbors",
        "plan_assess_risk",
        "plan_list_tasks",
        "memory_retrieve",
    ],
    "wiki_writer": [
        "wiki_create_page",
        "wiki_update_page",
        "wiki_search_pages",
        "wiki_get_page",
        "graph_add_edge",
        "graph_add_node",
    ],
    "integration_executor": [
        "ext_github_create_issue",
        "ext_github_list_issues",
        "ext_slack_send_message",
        "ext_slack_list_channels",
        "ext_jira_create_issue",
        "ext_linear_create_issue",
        "ext_notion_create_page",
    ],
    "analyst": [
        "memory_retrieve",
        "wiki_search_pages",
        "graph_analytics_page_rank",
        "graph_analytics_communities",
        "plan_get_project",
        "plan_list_tasks",
    ],
}


def get_tools_for_role(role: str, team_id: str, all_tools: list[dict]) -> list[dict]:
    """
    Return the subset of all_tools that this role is allowed to use,
    then append any MCP tools scoped to this role.

    MCP scoping rules:
    - High-risk MCP tools are never given to read-only roles.
    - If a server has ``allowed_crew_roles`` set, only listed roles get access.
    - If ``allowed_crew_roles`` is None, all roles get access (subject to risk filter).
    """
    # 1. Internal / OAuth tools
    allowed_names = set(ROLE_TOOL_MAP.get(role, []))
    scoped = [t for t in all_tools if t.get("name") in allowed_names]

    # 2. MCP tools from registry
    READ_ONLY_ROLES = {"researcher", "analyst", "risk_critic"}
    try:
        from chat.mcp.registry import get_mcp_registry
        from chat.mcp.health import is_server_available
        registry = get_mcp_registry()

        for tool_def in registry.get_tools_for_team(team_id):
            # Skip if server circuit is open
            if not is_server_available(tool_def.server_id):
                continue

            # Enforce allowed_crew_roles policy from the DB registration
            try:
                from chat.models import MCPServerRegistration
                server = MCPServerRegistration.objects.get(id=tool_def.server_id)
                allowed_roles = server.allowed_crew_roles  # list or None
            except Exception:
                allowed_roles = None

            if allowed_roles is not None and role not in allowed_roles:
                continue

            # High-risk tools excluded from read-only roles by default
            if tool_def.risk_level == "high" and role in READ_ONLY_ROLES:
                continue

            # Append as an OpenAI-compatible tool schema
            scoped.append({
                "name": tool_def.prefixed_name,
                "type": "function",
                "function": {
                    "name": tool_def.prefixed_name,
                    "description": f"[MCP: {tool_def.server_name}] {tool_def.description}",
                    "parameters": tool_def.parameters_schema,
                },
            })
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to inject MCP tools for role '%s'", role)

    return scoped

