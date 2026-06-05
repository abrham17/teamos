from chat.intent.schema import IntentSchema

INTENT_EXAMPLES = [
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
]
