import logging
from django.db import models
from django.utils import timezone
from chat.models import ProceduralMemory, DirectiveType

logger = logging.getLogger(__name__)

def get_relevant_directives(
    team_id: str,
    intent_type: str,
    domain: str,
    max_directives: int = 8
) -> list[ProceduralMemory]:
    """
    Retrieve directives relevant to this specific intent + domain.
    Much more precise than the legacy 20-directive flat injection.
    """
    # Query: directives for this team that apply to this intent type and domain
    directives = ProceduralMemory.objects.filter(
        team_id=team_id,
        confidence__gte=0.4,
        contradiction_count__lt=3,  # Exclude contradicted directives
    )
    
    if domain:
        directives = directives.filter(
            models.Q(domain=domain) | models.Q(domain__isnull=True) | models.Q(domain="")
        )
    else:
        directives = directives.filter(models.Q(domain__isnull=True) | models.Q(domain=""))

    # Intent type match: includes this intent type OR empty (applies to all)
    # Since applicable_intent_types is a JSONField (list), we check if it is empty/contains the type
    # For simplicity, we filter in memory or via Q queries
    matched_directives = []
    for d in directives.order_by("-confidence", "-reinforcement_count", "-last_reinforced_at"):
        intents = d.applicable_intent_types or []
        if not intents or intent_type in intents:
            matched_directives.append(d)
            if len(matched_directives) >= max_directives:
                break
                
    # Update last_used_at in bulk/parallel
    if matched_directives:
        ids = [d.id for d in matched_directives]
        ProceduralMemory.objects.filter(id__in=ids).update(last_used_at=timezone.now())
        
    return matched_directives


def format_directives_for_prompt(directives: list[ProceduralMemory]) -> str:
    """Format retrieved directives for system prompt injection."""
    if not directives:
        return ""
        
    sections = {
        DirectiveType.PLANNING_HEURISTIC: [],
        DirectiveType.RISK_PATTERN: [],
        DirectiveType.FAILURE_PATTERN: [],
        DirectiveType.SUCCESS_PATTERN: [],
        DirectiveType.INTEGRATION_RULE: [],
        DirectiveType.VOCABULARY: [],
        DirectiveType.WORKFLOW_PREFERENCE: [],
        DirectiveType.COMMUNICATION_STYLE: [],
    }
    
    for directive in directives:
        t = directive.directive_type
        if t in sections:
            sections[t].append(directive.directive)
            
    output = "\n## Team Knowledge & Behavioral Guidelines\n"
    
    if sections[DirectiveType.VOCABULARY]:
        output += "\n### Team Vocabulary\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.VOCABULARY])
        output += "\n"
        
    if sections[DirectiveType.PLANNING_HEURISTIC]:
        output += "\n### Planning Preferences\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.PLANNING_HEURISTIC])
        output += "\n"
        
    if sections[DirectiveType.RISK_PATTERN]:
        output += "\n### Known Risk Patterns\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.RISK_PATTERN])
        output += "\n"
        
    if sections[DirectiveType.FAILURE_PATTERN]:
        output += "\n### What NOT To Do\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.FAILURE_PATTERN])
        output += "\n"
        
    if sections[DirectiveType.SUCCESS_PATTERN]:
        output += "\n### What Works Well\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.SUCCESS_PATTERN])
        output += "\n"
        
    if sections[DirectiveType.INTEGRATION_RULE]:
        output += "\n### Integration Rules\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.INTEGRATION_RULE])
        output += "\n"

    if sections[DirectiveType.WORKFLOW_PREFERENCE]:
        output += "\n### Workflow Preferences\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.WORKFLOW_PREFERENCE])
        output += "\n"

    if sections[DirectiveType.COMMUNICATION_STYLE]:
        output += "\n### Communication Style\n"
        output += "\n".join(f"- {d}" for d in sections[DirectiveType.COMMUNICATION_STYLE])
        output += "\n"
        
    return output
