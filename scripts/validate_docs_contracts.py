#!/usr/bin/env python3
"""
Validate TeamOS documentation contract consistency.

Checks:
1) Required module docs contain:
   - Status line
   - "## Current behavior" section
   - "## Target behavior" section
   - Capability refs line
2) Capability refs in module docs map to valid capability IDs
   declared in docs/capability-matrix.md.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CAPABILITY_MATRIX = ROOT / "docs" / "capability-matrix.md"
MODULE_DOCS = [
    ROOT / "ingestion_module.md",
    ROOT / "wiki_system.md",
    ROOT / "knowledge_graph.md",
    ROOT / "chat_system.md",
    ROOT / "management_system.md",
    ROOT / "export_system.md",
]

CAP_ID_PATTERN = re.compile(r"^\|\s*([A-Z]{3,6}-\d{3})\s*\|")
CAP_ROW_PATTERN = re.compile(
    r"^\|\s*([A-Z]{3,6}-\d{3})\s*\|[^|]*\|[^|]*\|\s*(implemented|partial|planned)\s*\|",
    re.IGNORECASE,
)
INLINE_CAP_REF_PATTERN = re.compile(r"`([A-Z]{3,6}-\d{3})`")


def load_capability_statuses(matrix_path: Path) -> dict[str, str]:
    if not matrix_path.exists():
        raise FileNotFoundError(f"Capability matrix not found: {matrix_path}")

    statuses: dict[str, str] = {}
    for line in matrix_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        m = CAP_ROW_PATTERN.match(stripped)
        if m:
            statuses[m.group(1)] = m.group(2).lower()
            continue
        # Fallback support for older/simple rows
        fallback = CAP_ID_PATTERN.match(stripped)
        if fallback and fallback.group(1) not in statuses:
            statuses[fallback.group(1)] = "unknown"
    return statuses


def validate_module_doc(path: Path, capability_statuses: dict[str, str]) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"{path.name}: file not found"]

    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()

    if not any(line.startswith("**Status:**") for line in lines):
        errors.append(f"{path.name}: missing '**Status:**' line")
    status_line = next((line for line in lines if line.startswith("**Status:**")), "")
    status_claim = status_line.lower()
    if "## Current behavior" not in content:
        errors.append(f"{path.name}: missing '## Current behavior' section")
    if "## Target behavior" not in content:
        errors.append(f"{path.name}: missing '## Target behavior' section")
    if not any(line.startswith("**Capability refs:**") for line in lines):
        errors.append(f"{path.name}: missing '**Capability refs:**' line")

    referenced_ids = set(INLINE_CAP_REF_PATTERN.findall(content))
    if not referenced_ids:
        errors.append(f"{path.name}: no capability IDs referenced (e.g. `ABC-001`)")
    else:
        unknown = sorted(ref for ref in referenced_ids if ref not in capability_statuses)
        if unknown:
            errors.append(f"{path.name}: unknown capability IDs: {', '.join(unknown)}")
        else:
            referenced_statuses = {ref: capability_statuses[ref] for ref in sorted(referenced_ids)}
            if "implemented" in status_claim:
                if not any(s == "implemented" for s in referenced_statuses.values()):
                    errors.append(
                        f"{path.name}: status claims implemented but no referenced capabilities are implemented"
                    )
                planned_refs = [cap for cap, st in referenced_statuses.items() if st == "planned"]
                if planned_refs:
                    errors.append(
                        f"{path.name}: status claims implemented but references planned capabilities: {', '.join(planned_refs)}"
                    )

    return errors


def main() -> int:
    try:
        capability_statuses = load_capability_statuses(CAPABILITY_MATRIX)
    except Exception as exc:
        print(f"[docs-contract] ERROR: {exc}")
        return 1

    all_errors: list[str] = []
    for doc in MODULE_DOCS:
        all_errors.extend(validate_module_doc(doc, capability_statuses))

    if all_errors:
        print("[docs-contract] FAILED")
        for err in all_errors:
            print(f" - {err}")
        return 1

    print("[docs-contract] OK")
    print(f" - validated module docs: {len(MODULE_DOCS)}")
    print(f" - capability IDs loaded: {len(capability_statuses)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
