#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# start-local.sh — Run the MCP gateway locally (without Docker)
# ─────────────────────────────────────────────────────────────────
# Usage:
#   cd mcp-gateway
#   cp .env.example .env          # then fill in your tokens
#   chmod +x start-local.sh
#   ./start-local.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env if present
if [ -f .env ]; then
  echo "Loading .env..."
  set -o allexport
  # shellcheck disable=SC1091
  source .env
  set +o allexport
fi

# Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       TeamOS MCP Gateway — Local Mode            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Ports:"
echo "  9091 → GitHub"
echo "  9092 → Slack"
echo "  9093 → Trello"
echo "  9094 → Notion"
echo "  9095 → Google Drive"
echo "  9096 → Google Calendar"
echo ""
echo "Press Ctrl+C to stop."
echo ""

node server.js
