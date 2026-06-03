from typing import TypedDict, Optional, Annotated
from langgraph.graph.message import add_messages

class PlanningState(TypedDict):
    # Input
    user_prompt: str
    team_id: str
    project_id: Optional[str]
    session_id: str
    
    # Stage outputs (accumulated through graph)
    research_results: dict          # Stage 1 output
    synthesis: dict                 # Stage 2 output
    strategy_fast: dict             # Stage 3a output
    strategy_safe: dict             # Stage 3b output  
    selected_strategy: dict         # Stage 4 output
    critique_score: float           # Stage 4 output
    final_plan: dict                # Stage 5 output
    simulation_result: dict         # Stage 6 output (new)
    
    # Control flow
    guardian_approved: bool
    human_approved: Optional[bool]  # None = not yet asked
    current_stage: str
    error: Optional[str]
    retry_count: int
    
    # Metadata
    messages: Annotated[list, add_messages]  # Conversation context
    memory_refs: list               # Retrieved episodic episodes
    token_usage: dict               # Running cost tracker

    # MCP availability snapshot (taken at graph start, prevents mid-run surprises)
    mcp_available_servers: list     # Server names healthy at graph construction time
    mcp_tools_used: list            # Prefixed tool names called during this run

