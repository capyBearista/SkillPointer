# SkillCat Core - Python Migration Toolkit

**Technology**: Python
**Entry Point**: `installer.py`, `__main__.py`
**Parent Context**: This extends [../AGENTS.md](../AGENTS.md)

## Development Commands

### From Root
```bash
# Direct Setup run (Claude or OpenCode)
python -m skillcat --run-setup --agent claude
python -m skillcat --run-setup --agent opencode

# Launch compatibility Python entrypoint (spawns Bun)
python -m skillcat
```

### Pre-PR Checklist
```bash
# Ensure sandbox logic works without affecting real ~ paths
# Run local mock tests via custom sandbox configuration (if configured)
```

## Architecture

### Directory Structure
```
skillcat/
├── __init__.py
├── __main__.py          # Launch wrapper and entry point parsing
└── installer.py         # OS mutation, paths, and skill migration logic
```

### Code Organization Patterns

#### Migration Logic
- ✅ **DO**: Contain all destructive or OS-modifying operations (like `shutil.move`, `shutil.rmtree`) within `installer.py`.
- ✅ **DO**: Use explicit user confirmations or safe fallback defaults before executing folder replacements in the hidden vault.
- ❌ **DON'T**: Modify generated pointer files (e.g. `*-category-pointer/SKILL.md`) manually. The `pointer_template` exists in `installer.py` for this exact purpose.

#### Stateful Execution
- ✅ **DO**: Handle active vs hidden vault pathing carefully.
  - OpenCode: `~/.config/opencode/skills` <-> `~/.opencode-skill-libraries`
  - Claude: `~/.claude/skills` <-> `~/.skillcat-vault`
- ✅ **DO**: Ensure migration skips folders ending in `-category-pointer` and empty directories.

## Key Files

### Core Files (understand these first)
- `installer.py` - The heart of the migration process. Understand the `run_setup`, `ensure_directory`, and the recursive pointer generation logic.

## Quick Search Commands

### Find Logic
```bash
# Find functions in installer
rg -n "def " skillcat/installer.py

# Check pointer template
rg -n "pointer_template" skillcat/installer.py
```

## Common Gotchas

- **Destructive Updates**: If a destination skill folder already exists in the hidden vault, it must be deleted via `shutil.rmtree(dest)` before the new version is moved.
- **Paths**: Python's `os.path.expanduser("~")` is strictly required for cross-platform fallback handling.

## Testing Guidelines

### Sandboxing & Mocks
- **Mocks-Only Policy**: Since there is currently no active CI testing for this module, ensure all execution paths are verified locally using a "sandbox" or mock directory path instead of the live user `~/.config/opencode` folder before committing a PR.
- **Validation**: Any changes to `installer.py` must include a manual validation summary documenting what was tested safely before opening a pull request.
