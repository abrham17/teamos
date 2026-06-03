from .context import GuardianContext, GuardianResult

DESTRUCTIVE_TOOLS = {
    "plan_delete_project",
    "plan_bulk_delete_tasks", 
    "wiki_delete_page",
    "ext_github_delete_branch",
}

EXTERNAL_WRITE_TOOLS = {
    "ext_slack_send_message",
    "ext_github_create_issue",
    "ext_notion_create_page",
    "ext_linear_create_issue",
}

def tier1_check_mcp(
    prefixed_name: str,
    tool_input: dict,
    context: GuardianContext
) -> GuardianResult:
    """
    Called before any MCP tool execution.
    Uses registry metadata — no hardcoded tool names needed.
    """
    try:
        from chat.mcp.registry import get_mcp_registry
        from chat.mcp.health import is_server_available
    except ImportError:
        return GuardianResult(approved=True, tier=1)

    registry = get_mcp_registry()
    tool_def = registry.get_tool(prefixed_name)
    
    if not tool_def:
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP tool '{prefixed_name}' is not registered for this team",
            latency_ms=0
        )
    
    # Rule: Destructive tools require explicit human approval
    if tool_def.is_destructive and not context.human_approved_destructive:
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP tool '{prefixed_name}' is classified as destructive — requires explicit approval",
            latency_ms=0
        )
    
    # Rule: External writes require session-level permission
    if tool_def.is_external_write and not context.external_writes_enabled:
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP tool '{prefixed_name}' writes externally — enable external writes for this session",
            latency_ms=0
        )
    
    # Rule: Circuit breaker check (fast — Redis lookup)
    if not is_server_available(tool_def.server_id):
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP server '{tool_def.server_name}' is unavailable",
            latency_ms=0
        )
    
    return GuardianResult(approved=True, tier=1)

def tier1_check(tool_name: str, tool_input: dict, context: GuardianContext) -> GuardianResult:
    # Route MCP tools to their own validation layer
    if tool_name.startswith("mcp_"):
        return tier1_check_mcp(tool_name, tool_input, context)

    # Check 1: Destructive operations always require explicit human approval flag
    if tool_name in DESTRUCTIVE_TOOLS:
        if not context.human_approved_destructive:
            return GuardianResult(
                approved=False,
                tier=1,
                reason=f"{tool_name} is destructive and requires explicit user approval",
                latency_ms=0
            )
    
    # Check 2: Budget enforcement
    if context.token_usage_this_run > context.team_token_budget * 0.9:
        return GuardianResult(
            approved=False,
            tier=1,
            reason="Approaching token budget limit — aborting to prevent overage",
            latency_ms=0
        )
    
    # Check 3: Plan tier entitlement
    if tool_name.startswith("ext_") and not context.team_has_integrations:
        return GuardianResult(
            approved=False,
            tier=1,
            reason="Integration tools require Team or Pro plan",
            latency_ms=0
        )
    
    # Check 4: Cross-team resource access
    target_team = tool_input.get("team_id") or tool_input.get("project_team_id")
    if target_team and str(target_team) != str(context.acting_team_id):
        return GuardianResult(
            approved=False,
            tier=1,
            reason="Cross-team resource access denied",
            latency_ms=0
        )
    
    # Check 5: External writes in non-dry-run mode
    if tool_name in EXTERNAL_WRITE_TOOLS and not tool_input.get("dry_run", False):
        if not context.external_writes_enabled:
            return GuardianResult(
                approved=False,
                tier=1,
                reason="External writes are disabled for this session",
                latency_ms=0
            )
    
    return GuardianResult(approved=True, tier=1)

