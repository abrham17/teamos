#!/usr/bin/env python3
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
BRANCH_SCRIPT = ROOT / "scripts" / "configure_branch_protection.sh"
REQUIRED_CHECKS = {"backend", "frontend", "docs-contract"}


def extract_ci_job_names(content: str) -> set[str]:
    matches = re.findall(r"^  ([a-zA-Z0-9_-]+):\s*$", content, flags=re.MULTILINE)
    return set(matches)


def extract_branch_protection_contexts(content: str) -> set[str]:
    return set(re.findall(r'contexts\[\]="([^"]+)"', content))


def main() -> int:
    ci_content = CI_WORKFLOW.read_text(encoding="utf-8")
    script_content = BRANCH_SCRIPT.read_text(encoding="utf-8")

    ci_jobs = extract_ci_job_names(ci_content)
    if not REQUIRED_CHECKS.issubset(ci_jobs):
        missing = sorted(REQUIRED_CHECKS - ci_jobs)
        print(f"[branch-protection] FAILED: ci.yml missing required jobs: {', '.join(missing)}")
        return 1

    contexts = extract_branch_protection_contexts(script_content)
    if contexts != REQUIRED_CHECKS:
        missing = sorted(REQUIRED_CHECKS - contexts)
        extra = sorted(contexts - REQUIRED_CHECKS)
        if missing:
            print(f"[branch-protection] FAILED: script missing contexts: {', '.join(missing)}")
        if extra:
            print(f"[branch-protection] FAILED: script has unexpected contexts: {', '.join(extra)}")
        return 1

    print("[branch-protection] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
