from collections import defaultdict

def simulate_plan(plan: dict, team_id: str) -> dict:
    """
    Dry-run the plan against current team state.
    Returns conflict report — does NOT touch DB.
    """
    tasks = plan.get("tasks", [])
    
    issues = []
    
    # Check 1: Dependency conflicts
    for task in tasks:
        # In draft stage, dependency_ids or depends_on may exist
        deps = task.get("dependency_ids", []) or task.get("depends_on", [])
        for dep_id in deps:
            dep = next((t for t in tasks if str(t.get("id", "")) == str(dep_id) or str(t.get("order_index", "")) == str(dep_id)), None)
            
            task_start = task.get("startDate") or task.get("start_date")
            dep_start = dep.get("startDate") or dep.get("start_date") if dep else None
            
            if dep and dep_start and task_start and dep_start >= task_start:
                issues.append({
                    "type": "dependency_conflict",
                    "task": task.get("title", "Unknown"),
                    "dependency": dep.get("title", "Unknown"),
                    "severity": "high"
                })
    
    # Check 2: Resource overload
    member_load = defaultdict(list)
    for task in tasks:
        assignee = task.get("assignee_id") or task.get("assignee")
        if assignee:
            member_load[assignee].append(task)
    
    for member_id, member_tasks in member_load.items():
        # A simple check: if a member is assigned more than 5 tasks in this draft plan
        # Note: a true implementation would check overlapping dates. This is a simplified proxy.
        concurrent = len(member_tasks)
        if concurrent > 5:
            issues.append({
                "type": "resource_overload",
                "member_id": member_id,
                "concurrent_tasks": concurrent,
                "severity": "medium"
            })
            
    # Check 3: Timeline feasibility (simplified check)
    has_critical_issue = any(i["severity"] == "critical" for i in issues)
    has_high_issue = any(i["severity"] == "high" for i in issues)
    
    risk_score = 0
    risk_score += sum(30 for i in issues if i["severity"] == "critical")
    risk_score += sum(20 for i in issues if i["severity"] == "high")
    risk_score += sum(5 for i in issues if i["severity"] == "medium")
    
    return {
        "feasible": not has_critical_issue and not has_high_issue,
        "issues": issues,
        "risk_score": min(risk_score, 100)
    }
