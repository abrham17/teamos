# Topic 8: Frontend — The Upgraded TeamOS Interface
**TeamOS Deep Dive Series — Phase 2–3, Months 3–9**

> The backend upgrades make the system smarter, faster, and safer. The frontend upgrades make those improvements visible, legible, and trustworthy to the people using them. Without this, a 10x better backend feels identical to users.

---

## The Core Problem With the Current Frontend

Your current frontend is a capable but passive interface. It sends messages and receives streamed responses. It shows tool call traces in a collapsible timeline. It renders canvas nodes. It displays wiki pages.

What it doesn't do is make the system feel alive.

When a crew of four agents is working in parallel — a researcher pulling web sources, a strategic planner building a 90-day roadmap, a risk critic evaluating feasibility, a wiki writer documenting decisions — the user sees a blinking cursor and a loading indicator. They have no idea what's happening. When something goes wrong, it's silent or cryptic. When something goes brilliantly right, it's invisible.

The frontend upgrade has one goal: make the intelligence of the system legible at every moment, without overwhelming people who just want to get things done.

---

## Section 1: The Chat Interface — From Passive Stream to Agentic Theater

The chat window is where most users spend most of their time. It's the control center for everything the system does. The current implementation shows SSE events as they arrive, but it treats all events the same — as text to be rendered. The upgraded version treats different event types as fundamentally different UI experiences.

### 1.1 The Intent Acknowledgment Layer

The first thing a user needs to feel after sending a message is that the system understood them correctly. Right now there's no acknowledgment — the agent just starts doing things.

The upgraded interface shows a compact intent card immediately after the user sends a message, before any agent work begins. This card displays what the system interpreted the request to mean: the intent type, the complexity level, the domains it identified, and whether it's routing to a single agent or composing a crew. This takes under 100 milliseconds to appear because it comes from the classifier (Topic 6), not from the agent.

This card is interactive. If the system got the intent wrong — if it classified a complex multi-domain request as a simple lookup — the user can tap a correction. They don't have to wait for the wrong agent to produce the wrong output and then re-prompt. They fix the routing before it happens.

The card collapses into a single line once the agent starts working, so it doesn't take up permanent space in the thread.

### 1.2 The Crew Activity Panel

When the system routes to a crew (multiple agents working in parallel or sequence), the current interface has nothing to show for it. The upgraded version renders a live crew panel that sits above the streaming response text.

This panel shows each agent in the crew as a named row with a status indicator. The status is one of four states: queued (waiting for a dependency to complete), thinking (making an LLM call), executing (running tools), or done. Each row shows the agent's current action in plain language — not a raw tool name like `plan_create_task`, but a human-readable description like "creating 12 tasks for Q3 launch." This description comes from the SSE event stream, which the backend should include as a `human_label` field alongside the tool name.

When one agent sends a message to another — the supervisor routing context from the researcher to the strategic planner, for example — that message appears as a small connecting arrow between the two rows in the panel, with a one-sentence summary of what was passed. This makes the agent-to-agent communication visible without overwhelming the user with raw JSON.

The panel shrinks to a single summary line when all agents finish. It does not disappear — the user should be able to see that their request used a crew of three agents, what those agents were, and how long each took. This is important for building trust and for helping users understand when crew-level requests are appropriate.

### 1.3 The Guardian Block Experience

When the Guardian blocks an action, the current implementation returns an error message into the stream. That's fine for debugging but terrible for users.

The upgraded interface renders Guardian blocks as a distinct visual element — a styled card with a shield icon, the name of the action that was blocked, the reason in plain English, and the tier (rule-based vs. LLM-reviewed). The tone matters here. "Guardian blocked: `ext_slack_send_message` — external writes are disabled for this session" should feel informative, not like a crash.

Tier 1 blocks (rule-based, immediate) display inline in the chat with a neutral warning color. They're common and low-drama — often the user just needs to enable something in settings.

Tier 2 blocks (LLM-reviewed, semantic) display with more visual weight. They represent a judgment call — the system decided that an action was outside scope or incoherent with the user's intent. These should include a brief explanation of the reasoning, not just the conclusion.

For both tiers, there should be a clear path forward. If it's a permission issue, a direct link to the relevant settings toggle. If it's a scope issue, a suggestion for how to re-phrase the request to make the intent explicit.

### 1.4 The Thinking Block Redesign

The current collapsible reasoning traces are a start, but they're dense and hard to parse. The upgraded version restructures them into a three-layer progressive disclosure model.

The first layer is always visible: a single sentence summary of what the agent decided and why. This is synthesized from the LLM's reasoning output, not the raw trace.

The second layer, revealed on click, shows the key decision points: which tools were considered and why some were rejected, what information from the wiki or episodic memory was retrieved and whether it was relevant, and what the agent's confidence level was at each step.

The third layer, revealed on a second click, shows the full raw trace for people who want the complete picture — the same level of detail as today, but now behind two clicks instead of one.

This hierarchy means casual users get a one-sentence summary. Power users get the full trace. Nobody is forced to parse raw JSON to understand what happened.

### 1.5 Citation and Source Rendering

When agents retrieve content from the wiki, plan data, or external web sources, citations should be rendered as interactive inline footnotes — not as a separate list at the bottom of the response.

A cited sentence should have a small superscript indicator. Hovering it shows a popover with the source name, page title (for wiki sources), and a one-sentence excerpt. Clicking opens a side panel with the full source without navigating away from the chat.

For web research results, the citation should include the source domain and publication date so users can judge credibility without leaving the interface.

---

## Section 2: The Planning Canvas — Making Intelligence Visible

The planning canvas is the most visually ambitious part of the product. It already has nodes, edges, drag-to-create, minimap, and undo/redo. The upgrade layer adds agent awareness — the canvas becomes a live view of what the agent is building, not just a static diagram of what was built.

### 2.1 Agent Avatars on Canvas Nodes

When an agent is actively working on a node — creating tasks within a project node, evaluating a milestone node for risk, writing wiki content connected to an output node — that node should show a small avatar or status indicator to make the activity visible.

The avatar uses a color code that matches the crew panel in chat: researcher is one color, strategic planner another, risk critic another. The node pulses gently while the agent is active. When the agent finishes with that node, the pulse stops and a small checkmark appears.

This gives the canvas a sense of aliveness. Users watching the planning engine run for the first time should feel like they're watching a team of people work, not waiting for a spinner to resolve.

The avatars are driven by the existing SSE event stream. No new backend endpoints are needed. The frontend listens for events that include a `canvas_node_id` field alongside the agent ID and maps them to the canvas state.

### 2.2 Reasoning Traces on Canvas Nodes

Every node that was created, modified, or evaluated by an agent should carry a collapsible reasoning trace. This is the same reasoning trace from chat, but surfaced directly on the canvas node.

The trace appears as a small icon on the bottom-right corner of the node. Clicking it opens a compact side drawer, not a modal — the user should be able to read the reasoning while still seeing the canvas. The drawer shows why this node was created, what alternatives were considered, and if the risk critic flagged it, what the concern was and how it was resolved.

For task nodes, the trace should include the dependency inference reasoning: why this task was placed before another, what keyword or domain pattern drove the ordering. Dependency decisions are often opaque and frequently wrong — making the reasoning visible gives users the information they need to correct it without having to re-run the entire planning pipeline.

### 2.3 The Plan Diff View

When the planning engine produces a plan — or when a user modifies one — the canvas should have a diff mode. This shows what changed between the previous version and the current one. New nodes appear in a creation color. Modified nodes show a before/after comparison. Deleted nodes are shown with a strike-through rather than disappearing immediately.

This diff view is critical for the human approval breakpoint in the LangGraph pipeline (Topic 2). When the system pauses and asks the user to approve the plan before committing to the database, the user needs to see exactly what they're approving. "47 tasks across 6 milestones" is not enough information. The diff view shows them the full plan structure, what the risk critic flagged, and what the simulation found.

The approval UI sits at the bottom of the canvas in diff mode: a short summary of what the plan contains, a risk score from the simulation, any unresolved Guardian flags, and two buttons: Approve and Modify. Approve commits to the database. Modify keeps the user in the canvas with the ability to drag, rename, reconnect, and re-run specific stages.

### 2.4 AI Prompt Bar Evolution

The existing AI prompt bar at the bottom of the canvas generates plans from natural language. The upgrade makes it context-aware.

When a user has nodes selected on the canvas, the prompt bar knows about the selection. If a user selects a milestone node and types "expand this into subtasks", the system understands that "this" refers to the selected node and passes both the selection context and the prompt to the planning engine. The result appears as new nodes connected to the selected milestone, not as a top-level restructuring of the entire canvas.

The prompt bar should also surface quick actions as chips above the input field. These chips are context-sensitive: if the canvas shows unresolved conflicts (dependency violations, resource overloads), a chip appears saying "Resolve conflicts." If the plan has no risk assessment, a chip appears saying "Assess risks." These chips are not decorative — they trigger the appropriate agent tool directly.

### 2.5 Node Status Indicators

Every task and milestone node should show a status indicator that goes beyond the existing color coding. The upgraded status system has five states that are visually distinct: on track, at risk (approaching deadline with incomplete dependencies), blocked (hard dependency not met), overdue, and complete.

The "at risk" state is the most important new addition. It's not something users can set manually — it's computed by the autonomous schedule auditor (Celery Beat task that runs every 2 hours). When the auditor detects a potential conflict, it updates the node's risk state in the database. The frontend polls or subscribes via WebSocket to reflect this change. A node that was green yesterday and is now orange tells a user something important without requiring them to check a separate alerts screen.

---

## Section 3: The Wiki Editor — Knowledge as a Living System

The wiki editor is currently a strong Tiptap implementation with Yjs collaboration, backlinks, and AI autocomplete. The upgrades are additive — they make the knowledge graph more tangible and the ingest process more transparent.

### 3.1 The Backlink Graph Preview

Every wiki page already tracks backlinks. The upgrade surfaces this as a visual mini-graph anchored to the page. This is not the full Cytoscape knowledge graph — it's a small, focused subgraph showing only the immediate neighbors of the current page: pages that link to it, pages it links to, and pages that are semantically related (as determined by the graph engine's `ai_inferred` edges).

The mini-graph lives in the right sidebar, replacing or augmenting the current backlinks panel. Nodes in the mini-graph are clickable — clicking navigates to that page. Hovering shows the page title and the edge type (wikilink, ai_inferred, depends_on, etc.).

This makes the knowledge graph feel accessible to users who will never visit the `/graph` page. They don't need to understand graph theory — they just see that their SOP page is connected to three other pages, one of which contradicts it, and can click through to resolve it.

### 3.2 The Ingest Progress Experience

The current ingest page shows a list of jobs with status badges. The upgrade makes it a live, progressive experience.

When a user submits a URL or file for ingestion, the page immediately shows a vertical pipeline with the stages: extracting, governance review, materializing, vectorizing, graph sync. Each stage animates as it becomes active. When the governance stage runs — where the AI reviews the content for contradictions with existing knowledge — the UI shows which existing pages were checked and whether conflicts were found.

If a conflict is found, the ingest pauses and surfaces it immediately rather than waiting for the job to finish. The user sees: "This document contradicts the content on [page name] — specifically the claim about X. How do you want to handle this?" They have three choices: override the existing page, keep both with a contradiction flag, or discard the incoming content. This is the knowledge PR workflow, made tangible.

The source citation panel — which shows which sentences in the ingested content map to which wiki pages they populated — should be visible during the materialization stage, not just after. Users watching their document being processed should see the text being parsed and allocated in real time.

### 3.3 Contradiction and Freshness Indicators

Every wiki page should show two new indicators in the metadata panel.

The first is a freshness score: how long ago was this page last updated, how many pages link to it (relevance proxy), and whether the ingest pipeline has seen new content that relates to this page's topic since it was last edited. A page that was accurate 6 months ago but has had 3 related documents ingested since then should surface a "may be outdated" signal.

The second is a contradiction badge: if the graph engine has flagged this page as contradicting another, the badge shows the number of conflicts and links directly to the conflict resolution flow. This is already tracked in the database via the `contradicts` edge type — the frontend just needs to surface it.

These indicators are passive. They don't block editing. They're gentle signals that give editors the context to make better decisions.

---

## Section 4: The Floating Panel System

This is the highest-ROI UI change relative to implementation cost. Users working on a plan frequently need to look at the wiki. Users editing the wiki frequently need to check a task. Users in chat frequently need to reference the canvas. Today, each of those actions requires navigating away and losing the current context.

The floating panel system allows any page to be opened as a floating overlay that persists while you navigate the main view. It's not a second window or a tab — it's a draggable, resizable panel that sits in front of the current page.

### 4.1 How It Works

A floating panel can be opened from any link in the product: a wiki page link in the chat response, a task link in the wiki sidebar, a canvas node in the planning view. Clicking a link with a modifier key (or a secondary action on mobile) opens it as a panel rather than navigating.

The panel has a minimal chrome: a title bar with the page name and page type icon, a close button, a "pop out" button that opens it as a full page, and a resize handle. The content inside is the full page component — not a read-only preview, but the actual interactive page. Users can edit a wiki page in the floating panel. They can approve a task in the floating panel. They can run a chat session in the floating panel.

Panels are persistent across navigation. If a user opens a wiki page as a panel, then navigates from `/plan` to `/wiki`, the panel stays open. If they close it, it closes. If they navigate back to `/plan`, the panel is still there.

### 4.2 Panel Memory

The last open panels are stored in the user's session state (or user preferences if they want them to persist across sessions). When a user returns to a workspace they were in yesterday with two panels open, they come back to the same configuration. This is a small thing that feels significant — it means the tool remembers how you were working.

### 4.3 The Most Important Panel Use Cases

The most valuable panel interactions are:

A user in the chat receiving a plan from the strategic planner agent can open the canvas as a panel without leaving the chat. They can see the nodes being created in real time, approve the plan from the panel, and continue the conversation — all in a single view.

A user editing a wiki page can open a related page as a panel to compare content while editing. With Yjs live collaboration, both pages show presence indicators — they can see if a teammate is editing the related page at the same time.

A user in the planning canvas can open a task's linked wiki documentation as a panel. They don't need to navigate away to understand the context behind a task node.

---

## Section 5: The Integrations and Settings Layer

These pages are functional but minimal today. The upgrade makes them useful as a daily driver, not just a one-time configuration screen.

### 5.1 The Integrations Health Dashboard

The `/integrations` page currently shows connected/disconnected status for 11 OAuth providers. The upgrade adds a health layer: for each connected provider, show the last successful tool call, the failure rate over the last 7 days, and the current circuit state if applicable (especially relevant for MCP servers from Topic 7).

For MCP servers specifically, show the registered tools, their risk classification, and the crew role access policy — with the ability to edit the role access directly from this page. A server with three high-risk tools should look different from a server with ten read-only lookup tools, and users should be able to configure that difference without writing code.

### 5.2 The Memory and Learning Panel

The procedural memory system (Topic 5) learns team-specific rules and patterns over time. This is invisible to users today. The upgrade surfaces it as a panel in the `/settings` area.

The panel shows the directives the system has learned, organized by domain and type. A user can see that the system has learned their team works in 2-week sprints, that backend API tasks need 30% more buffer time, and that "P0" means a blocking issue that goes to a senior member. They can read these directives, edit them for accuracy, delete the ones that are wrong, and add new ones manually.

This panel serves two purposes. It builds trust — users can see that the system is learning and verify that what it learned is correct. And it provides a correction mechanism — when the retrospective loop extracts a wrong pattern from a bad episode, users can remove it before it infects future agent behavior.

The panel should also show the source of each directive: "Learned from 3 successful engineering sprint plans" or "Learned from a failed Q3 planning session." This provenance makes it easy to judge whether a directive is trustworthy.

### 5.3 The Usage and Cost Transparency View

The admin and analytics pages show token usage. The upgrade adds a per-feature cost breakdown that's visible to team owners without needing to dig into the admin dashboard.

The view shows: total tokens consumed this billing period, broken down by feature (planning engine, chat, research, ingest). For planning specifically, it shows cost per plan run — both the cheapest (Flash model, fast-track, no crew) and the most expensive (Pro model, full crew, multiple reflection rounds). This gives team owners the information they need to make decisions about plan tier and usage patterns.

For Pro and Enterprise plans, a budget alert system allows owners to set a monthly token ceiling. When the system approaches 80% of the ceiling, a warning banner appears for owners. When it hits 100%, the LLM orchestrator's cost-curve routing shifts entirely to Flash for non-critical operations until the next billing period — a graceful degradation rather than a hard stop.

---

## Section 6: The Agent Avatars on Canvas — Deep Behavior

This section expands on Section 2.1 because the visual design decisions here are more consequential than they appear.

### 6.1 What the Avatars Represent

Each agent role in the crew system has a persistent visual identity across the interface. The researcher has one icon and color. The strategic planner has another. The risk critic has another. These identities are consistent across the chat crew panel, the canvas node avatars, the reasoning trace headers, and the Guardian block cards.

This consistency matters because it trains users to recognize agents. After a few sessions, a user who sees the risk critic's icon on a canvas node knows immediately that the orange flag on that node came from risk analysis — not from a Guardian block, not from a dependency conflict. The visual language becomes a shared vocabulary between the user and the system.

### 6.2 What Happens When Agents Conflict

When two agents produce conflicting outputs — the strategic planner wants to schedule a task for week 3, the risk critic says the dependency makes week 3 impossible — the system currently resolves this internally before the user sees anything. The upgrade surfaces the conflict as a canvas-level event.

A conflict badge appears on the affected nodes, showing both agents' icons side by side with a slash between them. Clicking the badge opens a compact resolution card: here is what the strategic planner proposed, here is why the risk critic objected, here are the two resolution options. The user makes the call. The chosen resolution is logged and feeds back into the procedural memory system as a human correction signal.

This is not a common event — the supervisor agent resolves most conflicts without user intervention. But when it surfaces, the experience should feel deliberate and informative rather than like an error state.

### 6.3 The Done State

When all agents finish and the plan is committed to the database, the canvas should enter a brief "settled" animation: nodes that were pulsing stop, agent avatars fade out, and the canvas returns to its static view — but with all the new nodes the agents created now fully rendered, connected, and colored by status.

This transition is important. It marks the end of the agentic run and the beginning of human work. The system is done; now the team takes over. The visual transition reinforces this handoff.

---

## Section 7: Mobile Considerations

The current interface is desktop-first. The floating panel system and canvas are not practical on mobile at their current scale. The upgrade doesn't try to port everything to mobile — it focuses on the interactions that are genuinely useful on a phone.

The chat interface works well on mobile with minor adjustments: the crew panel collapses to a horizontal scroll of agent status chips rather than a full panel. The intent card is smaller. Reasoning traces are hidden by default and accessible via a "See reasoning" link.

The wiki editor is readable on mobile but editing is limited to short comments and approvals — full editing remains a desktop experience.

The planning canvas is view-only on mobile: users can pan, zoom, tap nodes to see details and reasoning traces, and approve or reject plans from the human review breakpoint. They cannot create or edit nodes on mobile. This is an honest constraint, not a failure — most people reviewing a plan on their phone don't want to drag nodes around.

The floating panel system does not exist on mobile. Instead, links open as full-page navigation with a back button that returns to the originating page. This is standard mobile navigation behavior and doesn't need to be reinvented.

---

## Section 8: What to Build in What Order

The frontend upgrades span several months and should be delivered in order of user-visible impact relative to implementation effort.

The first priority is the chat interface upgrades: intent acknowledgment card, crew activity panel, and Guardian block rendering. These have direct impact on every single user session and require no new backend work — they consume SSE events that the backend already emits after the Topic 1–4 upgrades. They should be built immediately after the backend upgrades land, not as a separate phase.

The second priority is the floating panel system. This is frontend-only, no backend changes needed, and it unblocks a pattern that users are already asking for — staying in context while referencing another page. It makes the entire product feel more cohesive.

The third priority is the canvas agent avatars and reasoning traces. These require the backend to emit `canvas_node_id` in SSE events — a small change — and then the frontend work is self-contained within the canvas component. The plan diff view and approval UI for the human review breakpoint belong in this same workstream.

The fourth priority is the wiki improvements: mini-graph in the sidebar, freshness and contradiction indicators, and the live ingest experience. These are lower urgency because they enhance existing functionality rather than making new backend capabilities visible.

The fifth priority is the settings and transparency layer: memory panel, integration health dashboard, and cost breakdown. These matter for power users and team owners. They should be live before enterprise sales conversations, not necessarily before general availability.

---

## What the Frontend Should Never Do

These are as important as the implementation plan:

Never show raw tool names to users. `plan_create_task` should always be rendered as "creating tasks" or similar. `ext_slack_send_message` should be "sending Slack message to #channel." The agent system prompt already has human labels for tools — use them everywhere in the UI.

Never surface Guardian blocks as errors. A Guardian block is the system working correctly. It should feel like the system being careful, not broken.

Never auto-scroll the chat to the bottom while the user is reading earlier content. This is the single most disruptive thing a streaming interface can do. Detect whether the user has scrolled up; if they have, show a "scroll to latest" button instead of forcing them down.

Never animate things that aren't meaningful. The canvas node pulse during agent activity is meaningful — it tells you something is happening. A loading spinner spinning for its own sake is noise. Every animation should carry information.

Never make the crew panel the dominant visual element for simple queries. When a user asks "what's the status of project X?", the system routes to a single agent, finds the answer in under 2 seconds, and returns it. The chat thread for this interaction should look like a normal chat message — no crew panel, no multi-stage pipeline visualization. The progressive complexity of the UI should match the actual complexity of the operation.

---

*The backend makes the system intelligent. The frontend makes intelligence legible. Both matter equally — a system that's brilliant but opaque will never be trusted, and a system that's transparent but shallow won't be used.*
