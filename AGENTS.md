# SkillCat

## Overview
- **Type**: Hybrid Polyglot Repository (Terminal application + environment migration toolkit)
- **Stack**: TypeScript, React, OpenTUI (`@opentui/core`, `@opentui/react`), Python
- **Architecture**: Interactive Terminal Application phase (read-only OS layer) followed by Migration phase (stateful OS mutation layer)
- **Runners**: Bun, Node (`bunx`, `npx`), Python compatibility layer

This AGENTS.md is the authoritative source for development guidelines. 
Subdirectories contain specialized AGENTS.md files that extend these rules.

## Universal Development Rules

### Code Quality (MUST)
- **MUST** include tests for all new UI/core state features in the `opentui` layer using Node's native test runner
- **MUST** run sandbox checks for Python migration logic before opening a PR
- **MUST** keep the interactive UI phase strictly **read-only** regarding user directories (e.g. `~/.config/opencode`, `~/.claude`)
- **MUST NOT** commit secrets, API keys, or tokens

### Best Practices (SHOULD)  
- **SHOULD** prefer functional components with hooks for OpenTUI/React rendering
- **SHOULD** use descriptive variable names and keep functions focused
- **SHOULD** keep changes scoped to the task; avoid unrelated refactors
- **SHOULD** update `pointer_template` in `skillcat/installer.py` instead of hand-editing generated `SKILL.md` pointers
- **SHOULD** set up formatting and linting tools in the future (currently none configured, but standard conventions apply)

### Delivery Discipline (MUST)
- **MUST** open PRs from feature branches; never commit directly to `main`
- **MUST** include a short validation summary (what was tested and results) for both the UI flow and migration scripts

### Anti-Patterns (MUST NOT)
- **MUST NOT** push directly to the main branch
- **MUST NOT** run destructive Python migration operations (`shutil.rmtree`) without explicit user confirmation
- **MUST NOT** hand-edit generated `*-category-pointer/SKILL.md` files (they are dynamically regenerated)

## Core Commands

### Development
- `bunx skillcat` (or `npx skillcat`) - Interactive runtime launch (primary)
- `python -m skillcat` - Python compatibility launcher (spawns Bun runtime)
- `python -m skillcat --run-setup --agent <opencode|claude>` - Direct Python retained setup path
- `node --import tsx --test opentui/src/core/**/*.test.ts` - Run TypeScript tests

## Project Structure

### Applications
- **`opentui/`** → Modern terminal application core ([see opentui/AGENTS.md](opentui/AGENTS.md))
  - UI Routes: `src/routes/` (React components mapping to TUI states)
  - Business Logic: `src/core/` (Navigation state, intelligence caches)
  - Entry Points: `src/index.tsx`, `bin/skillcat.mjs`

### Infrastructure & Migration
- **`skillcat/`** → Legacy/Compatibility Python package ([see skillcat/AGENTS.md](skillcat/AGENTS.md))
  - Critical Migration Logic: `installer.py` (handles moving skills from active directories to hidden vaults)
  - OS Pathing & Pointer Generation

### Assets & Hidden Vaults
- **`.agents/`** & **`skills/`** → The hidden vault and active skill directories respectively
- **`assets/`** → Architecture diagrams and SVGs

## Quick Find Commands

### Code Navigation
```bash
# Find a UI Component or Route
rg -n "export (function|const) .*Route" opentui/src

# Find Core Logic & State
rg -n "export (class|function) .*State" opentui/src/core

# Find Python Setup Logic
rg -n "def " skillcat/installer.py
```

## Security & OS Mutations

### Safe Operations
- The migration phase (`skillcat/installer.py`) is the **ONLY** place where destructive/stateful operations occur on the user's `~/.config/opencode` or `~/.claude/` directories.
- If a destination skill folder already exists in the hidden vault, it is deleted via `shutil.rmtree(dest)` before move.
- Interactive UI phases must remain strictly pure/read-only on the OS.
- Migration skips only: folders ending with `-category-pointer` and empty folders.

### Paths and Mode Switching
- OpenCode paths:
  - active skills: `~/.config/opencode/skills`
  - hidden vault: `~/.opencode-skill-libraries`
- Claude paths:
  - active skills: `~/.claude/skills`
  - hidden vault: `~/.skillcat-vault`

## Git Workflow

- Branch from `main` for features: `feature/description`, `fix/description`
- Treat git history as functional long-term memory for the codebase. When creating a new commit for uncommitted changes run `git status && git diff HEAD && git status --porcelain` to see what files are uncommitted
- Keep commit messages **atomic**

## Testing Requirements

- **Unit tests**: Handled via Node's native test runner (`node --import tsx --test`) in `opentui/src/core/`.
- **Migration scripts**: Currently mock-only or local sandbox validation. Never run migrations on production directories without approval.

## Available Tools

You have access to:
- Standard bash tools (`rg`, `git`, `node`, `bun`, `npm`, etc.)
- OpenTUI Skill (for components, layout, keyboard handling, testing)
- Python environment tools

## Specialized Context

When working in specific directories, refer to their AGENTS.md:
- Terminal UI application: [opentui/AGENTS.md](opentui/AGENTS.md)
- Python Migration Logic: [skillcat/AGENTS.md](skillcat/AGENTS.md)
