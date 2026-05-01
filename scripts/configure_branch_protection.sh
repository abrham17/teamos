#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/configure_branch_protection.sh <owner/repo> [branch]

Examples:
  scripts/configure_branch_protection.sh acme/teamos main
  scripts/configure_branch_protection.sh acme/teamos master

Notes:
  - Requires GitHub CLI (`gh`) authenticated with repo admin permissions.
  - Configures required status checks to match this repo's CI jobs:
    backend, frontend, docs-contract
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

REPO="$1"
BRANCH="${2:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is not installed." >&2
  exit 1
fi

echo "Applying branch protection for ${REPO} (${BRANCH})..."

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  -f required_status_checks.strict=true \
  -F required_status_checks.contexts[]="backend" \
  -F required_status_checks.contexts[]="frontend" \
  -F required_status_checks.contexts[]="docs-contract" \
  -F enforce_admins=true \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -f required_pull_request_reviews.require_code_owner_reviews=false \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -f required_pull_request_reviews.require_last_push_approval=false \
  -f restrictions= \
  -f required_linear_history=true \
  -f allow_force_pushes=false \
  -f allow_deletions=false \
  -f block_creations=false \
  -f required_conversation_resolution=true \
  -f lock_branch=false \
  -f allow_fork_syncing=true

echo "Branch protection updated successfully."
