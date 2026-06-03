from chat.intent.schema import IntentSchema

INTENT_EXAMPLES = [
    # plan/create
    {
        "message": "create a product launch plan for Q3",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="high", domains=["product"],
            required_capabilities=["web_search", "plan_creation", "risk_analysis"],
            parallelizable=True, estimated_rounds=8, requires_external=False
        )
    },
    {
        "message": "build me a 6-week engineering roadmap",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="high", domains=["engineering"],
            required_capabilities=["plan_creation", "risk_analysis"],
            parallelizable=True, estimated_rounds=7, requires_external=False
        )
    },
    {
        "message": "setup a new project for team onboarding",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="medium", domains=["operations"],
            required_capabilities=["plan_creation"],
            parallelizable=False, estimated_rounds=4, requires_external=False
        )
    },
    {
        "message": "make a marketing campaign project",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="high", domains=["marketing"],
            required_capabilities=["plan_creation", "web_search"],
            parallelizable=True, estimated_rounds=6, requires_external=False
        )
    },
    {
        "message": "plan a website redesign sprint schedule",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="high", domains=["engineering", "design"],
            required_capabilities=["plan_creation", "risk_analysis"],
            parallelizable=True, estimated_rounds=8, requires_external=False
        )
    },
    {
        "message": "create Q4 roadmap for expansion",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="high", domains=["product", "strategy"],
            required_capabilities=["plan_creation", "risk_analysis"],
            parallelizable=True, estimated_rounds=8, requires_external=False
        )
    },
    {
        "message": "start a new development project called alpha",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="medium", domains=["engineering"],
            required_capabilities=["plan_creation"],
            parallelizable=False, estimated_rounds=4, requires_external=False
        )
    },
    {
        "message": "let's start planning our next feature release",
        "intent": IntentSchema(
            intent_type="plan/create", complexity="medium", domains=["product"],
            required_capabilities=["plan_creation"],
            parallelizable=False, estimated_rounds=5, requires_external=False
        )
    },

    # plan/update
    {
        "message": "add a new milestone to our website redesign project",
        "intent": IntentSchema(
            intent_type="plan/update", complexity="medium", domains=["engineering"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=3, requires_external=False
        )
    },
    {
        "message": "update project alpha status to active",
        "intent": IntentSchema(
            intent_type="plan/update", complexity="low", domains=["operations"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "change milestone target date to next Friday",
        "intent": IntentSchema(
            intent_type="plan/update", complexity="low", domains=["operations"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "rename our current sprint to Sprint 12",
        "intent": IntentSchema(
            intent_type="plan/update", complexity="low", domains=["operations"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },

    # plan/query
    {
        "message": "what is the status of our current project roadmap?",
        "intent": IntentSchema(
            intent_type="plan/query", complexity="low", domains=["operations"],
            required_capabilities=["plan_read"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "show me the milestones for project alpha",
        "intent": IntentSchema(
            intent_type="plan/query", complexity="low", domains=["operations"],
            required_capabilities=["plan_read"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "is our sprint plan on track?",
        "intent": IntentSchema(
            intent_type="plan/query", complexity="medium", domains=["operations"],
            required_capabilities=["plan_read", "risk_analysis"],
            parallelizable=False, estimated_rounds=3, requires_external=False
        )
    },
    {
        "message": "get active projects list",
        "intent": IntentSchema(
            intent_type="plan/query", complexity="low", domains=["operations"],
            required_capabilities=["plan_read"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },

    # wiki/query
    {
        "message": "what does our onboarding process look like",
        "intent": IntentSchema(
            intent_type="wiki/query", complexity="low", domains=["hr", "operations"],
            required_capabilities=["wiki_search"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "find the api documentation in the wiki",
        "intent": IntentSchema(
            intent_type="wiki/query", complexity="low", domains=["engineering"],
            required_capabilities=["wiki_search"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "search wiki for deployment guidelines",
        "intent": IntentSchema(
            intent_type="wiki/query", complexity="low", domains=["engineering"],
            required_capabilities=["wiki_search"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "get info about our holiday policy",
        "intent": IntentSchema(
            intent_type="wiki/query", complexity="low", domains=["hr"],
            required_capabilities=["wiki_search"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },

    # wiki/update
    {
        "message": "create a new wiki page for coding standards",
        "intent": IntentSchema(
            intent_type="wiki/update", complexity="medium", domains=["engineering"],
            required_capabilities=["wiki_write"],
            parallelizable=False, estimated_rounds=3, requires_external=False
        )
    },
    {
        "message": "update the API release notes wiki page",
        "intent": IntentSchema(
            intent_type="wiki/update", complexity="medium", domains=["engineering"],
            required_capabilities=["wiki_write", "wiki_search"],
            parallelizable=False, estimated_rounds=3, requires_external=False
        )
    },
    {
        "message": "add deployment checklist to wiki doc",
        "intent": IntentSchema(
            intent_type="wiki/update", complexity="medium", domains=["engineering"],
            required_capabilities=["wiki_write", "wiki_search"],
            parallelizable=False, estimated_rounds=3, requires_external=False
        )
    },

    # research/analyze
    {
        "message": "research our top 5 competitors and analyze their pricing",
        "intent": IntentSchema(
            intent_type="research/analyze", complexity="medium", domains=["product", "marketing"],
            required_capabilities=["web_search", "wiki_write"],
            parallelizable=True, estimated_rounds=5, requires_external=False
        )
    },
    {
        "message": "analyze latest market trends for generative AI workspaces",
        "intent": IntentSchema(
            intent_type="research/analyze", complexity="medium", domains=["product"],
            required_capabilities=["web_search"],
            parallelizable=False, estimated_rounds=4, requires_external=False
        )
    },
    {
        "message": "find recent tech stack updates in competitor blog posts",
        "intent": IntentSchema(
            intent_type="research/analyze", complexity="medium", domains=["engineering"],
            required_capabilities=["web_search"],
            parallelizable=False, estimated_rounds=4, requires_external=False
        )
    },

    # task/create
    {
        "message": "add a task to fix the login bug in project alpha",
        "intent": IntentSchema(
            intent_type="task/create", complexity="low", domains=["engineering"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "create task: draft Q3 slides, assign to marketing lead",
        "intent": IntentSchema(
            intent_type="task/create", complexity="low", domains=["marketing"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "make a new todo item for setting up databases",
        "intent": IntentSchema(
            intent_type="task/create", complexity="low", domains=["engineering"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },

    # task/update
    {
        "message": "mark task fix login bug as completed",
        "intent": IntentSchema(
            intent_type="task/update", complexity="low", domains=["engineering"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "assign database task to Alice and change status to in-progress",
        "intent": IntentSchema(
            intent_type="task/update", complexity="low", domains=["engineering"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },
    {
        "message": "postpone the write documentation task by 2 days",
        "intent": IntentSchema(
            intent_type="task/update", complexity="low", domains=["engineering"],
            required_capabilities=["task_management"],
            parallelizable=False, estimated_rounds=2, requires_external=False
        )
    },

    # chat/general
    {
        "message": "hello, who are you and how can you help me today?",
        "intent": IntentSchema(
            intent_type="chat/general", complexity="low", domains=["general"],
            required_capabilities=[],
            parallelizable=False, estimated_rounds=1, requires_external=False
        )
    },
    {
        "message": "explain how OAuth flow works in simple terms",
        "intent": IntentSchema(
            intent_type="chat/general", complexity="low", domains=["general"],
            required_capabilities=[],
            parallelizable=False, estimated_rounds=1, requires_external=False
        )
    },
    {
        "message": "help me compose a nice response to a client email",
        "intent": IntentSchema(
            intent_type="chat/general", complexity="low", domains=["general"],
            required_capabilities=[],
            parallelizable=False, estimated_rounds=1, requires_external=False
        )
    },

    # integration/action
    {
        "message": "send a slack message to channels warning about down service",
        "intent": IntentSchema(
            intent_type="integration/action", complexity="medium", domains=["operations"],
            required_capabilities=["integration_slack"],
            parallelizable=False, estimated_rounds=3, requires_external=True
        )
    },
    {
        "message": "create a github issue for fix registration validator",
        "intent": IntentSchema(
            intent_type="integration/action", complexity="medium", domains=["engineering"],
            required_capabilities=["integration_github"],
            parallelizable=False, estimated_rounds=3, requires_external=True
        )
    },
    {
        "message": "sync our project tasks to Jira",
        "intent": IntentSchema(
            intent_type="integration/action", complexity="medium", domains=["engineering"],
            required_capabilities=["integration_jira"],
            parallelizable=False, estimated_rounds=4, requires_external=True
        )
    }
]
