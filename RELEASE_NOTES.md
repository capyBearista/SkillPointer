# SkillCat Release Notes

## v0.1.0 - OpenTUI Baseline with Guided Safety Flows

### Highlights

- OpenTUI-first runtime for `bunx skillcat` and `npx skillcat`.
- Guided init flow with explicit path selection, plan preview, and safe conflict policies.
- Browse, maintain, presets, and stats routes available in one keyboard-first shell.
- Deterministic pointer index generation with retrieval guidance and derived tags.

### Migration Guidance (SkillPointer -> SkillCat)

- Command rename:
  - old: `skillpointer`
  - new: `bunx skillcat` or `npx skillcat`
- Python compatibility launcher remains available:
  - `python -m skillcat`
  - `python -m skillcat --run-setup --agent opencode`
  - `python -m skillcat --run-setup --agent claude`
- Claude vault migration behavior:
  - legacy `~/.skillpointer-vault` migrates to `~/.skillcat-vault` in Claude mode.
  - when both exist, SkillCat keeps using `~/.skillcat-vault` and leaves legacy data unchanged.

### Runtime Notes

- Interactive mode requires Bun for runtime execution.
- Setup/migration operations still live in Python and are invoked explicitly with `--run-setup`.
- Local sandbox paths (`.skill-test`, `.skill-test-vault`) support repeatable validation runs.

### Validation Commands

```bash
npm test
npm run typecheck
bunx skillcat
npx skillcat
python -m skillcat --help
```
