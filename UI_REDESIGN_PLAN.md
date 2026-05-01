# TeamOS UI Redesign Plan

> Full frontend overhaul — dark/light theme, deeply enhanced graph, polished navigation, chat polish, wiki improvements, and a toast notification system.

---

## Phases & Files

### P1 — Foundations
- **`globals.css`** — Fix Tailwind v4 syntax (`@import "tailwindcss"` vs deprecated `@tailwind` directives), wrap resets in `@layer base`, add animation keyframes (toast, bounce-dot, fade-in, scale-in), add new tokens (`--header-h`, `--shadow-*`, `--node-*`).
- **`ThemeProvider.tsx`** — React context wrapping `localStorage` + `document.documentElement.setAttribute("data-theme", ...)`. Includes `useTheme()` hook.
- **`ThemeToggle.tsx`** — Sun/Moon icon button, reads from `useTheme()`.
- **`Toast.tsx`** — `ToastProvider` + `useToast()`. Queue-based, auto-dismiss, four types (success / error / info / warning). Fixed bottom-right container.
- **`layout.tsx` (root)** — Adds inline theme script in `<head>` to prevent flash. Wraps body in `<ThemeProvider>` + `<ToastProvider>`. Updates metadata.

### P2 — Sidebar
- **`Sidebar.tsx`** — Collapsible rail (240px ↔ 72px) with `transition-[width]`. Active route detection via `usePathname()`. Custom team-selector dropdown (replaces `<select>`). Logo + collapse toggle. `+ New Page` CTA. Theme toggle at bottom.

### P3 — Graph (Deep Work)
- **`CytoscapeViewer.tsx`** — `forwardRef` + `useImperativeHandle` exposing `zoomIn / zoomOut / fit / exportPng / setLayout / highlightSearch / clearSearch`. Node colors by page type, node size by degree, edge color by type, edge width by confidence. Hover/selected states. Double-click → animate fit to 1-hop neighborhood.
- **`GraphToolbar.tsx`** — Zoom ± / Fit / Layout picker / Search input / Export PNG / Node·Edge count.
- **`NodeInspector.tsx`** — Slide-in right panel (transform translateX). Shows type badge (colored), title, updated date, summary, "Open in Editor" button, linked pages list.
- **`GraphLegend.tsx`** — Collapsible floating card (bottom-left). Node types + edge types with colored indicators.
- **`graph/page.tsx`** — Composes Toolbar + Viewer + Inspector + Legend. Manages `selectedNodeId`, `linkedNodes` computation, `searchQuery`, `layout` state. Passes `cyRef` to toolbar.

### P4 — Chat Polish
- **`ChatInterface.tsx`** — Session list with date formatting. Message bubbles with gradient on user messages. Bouncing-dot typing indicator (replaces spinner). Citation chips with confidence %. Empty state with icon card.

### P5 — Wiki + Settings Polish
- **`MarkdownWorkspace.tsx`** — `saveStatus` state ("saving" → "saved" → "idle"). Autosave pill in header. Better empty state with icon.
- **`settings/page.tsx`** — Plan badge styling, section descriptions, Danger Zone section.

### P6 — Toast + Polish (integrated throughout)
- Toast system is wired via `ToastProvider` in root layout. Any component can call `useToast()` to emit notifications.

---

## Design Tokens Added

| Token | Value | Purpose |
|---|---|---|
| `--header-h` | `52px` | Consistent header height |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.5)` | Subtle elevation |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,.4)` | Card/panel elevation |
| `--shadow-lg` | `0 8px 32px rgba(0,0,0,.5)` | Modal/overlay elevation |
| `--shadow-glow` | `0 0 20px var(--accent-glow)` | Accent glows |

## Graph Node Color Map

| Page Type | Color |
|---|---|
| standard | `#00d4e8` (cyan) |
| meeting | `#a855f7` (purple) |
| decision | `#f97316` (orange) |
| incident | `#ef4444` (red) |
| template | `#22c55e` (green) |

## Graph Edge Color Map

| Edge Type | Color |
|---|---|
| wikilink | `#00d4e8` (cyan) |
| ai_inferred | `#a855f7` (purple) |
| manual | `#22c55e` (green) |
