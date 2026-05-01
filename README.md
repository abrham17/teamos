# teamos

## Docs Contract Validation

Run the docs contract checker:

```bash
python3 scripts/validate_docs_contracts.py
```

It validates:
- required module doc sections (`Status`, `Current behavior`, `Target behavior`)
- capability references in module docs against `docs/capability-matrix.md`

## Branch Protection Setup

Configure required GitHub status checks for the main branch:

```bash
scripts/configure_branch_protection.sh <owner/repo> main
```

This applies required checks aligned with `.github/workflows/ci.yml`:
- `backend`
- `frontend`
- `docs-contract`

Validate branch-protection contract drift:

```bash
python3 scripts/validate_branch_protection_contract.py
```
