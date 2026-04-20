# OpenTUI Core - Terminal Application Layer

**Technology**: TypeScript, React, OpenTUI (`@opentui/core`, `@opentui/react`)
**Entry Point**: `src/index.tsx`, `../bin/skillcat.mjs`
**Parent Context**: This extends [../AGENTS.md](../AGENTS.md)

## Development Commands

### From Root
```bash
# Run TypeScript UI Tests
node --import tsx --test opentui/src/core/**/*.test.ts

# Launch interactive UI (dev mode)
bunx skillcat
```

### Pre-PR Checklist
```bash
# Ensure all UI state logic passes
node --import tsx --test opentui/src/core/**/*.test.ts
```

## Architecture

### Directory Structure
```
src/
├── components/        # Reusable TUI React components (Buttons, Lists, etc.)
├── core/              # State management, data fetching, routing logic
├── routes/            # Main screen components mapping to TUI states
└── index.tsx          # OpenTUI render entry point
```

### Code Organization Patterns

#### UI Components & Routes
- ✅ **DO**: Use functional React components with hooks for local state and OpenTUI layout components (`<Box>`, `<Text>`, etc.)
- ✅ **DO**: Map high-level application states to distinct Route components in `src/routes/`
- ❌ **DON'T**: Perform any OS-level mutations (like moving directories) inside React components. The UI must remain purely a read-only visualizer and state collector for the migration phase.

#### State Management
- ✅ **DO**: Use `src/core/` classes or state machines to manage intelligence caches, path profiles, and execution plans.
- ✅ **DO**: Keep UI components pure by injecting state or passing down callback handlers from top-level routes.

## Key Files

### Core Files (understand these first)
- `src/index.tsx` - Bootstraps the OpenTUI React reconciler
- `src/core/` - Business logic and `.test.ts` definitions

### Common Patterns
- Look at existing tests in `src/core/` for examples of how to construct node test runner mocks.
- Layouts in OpenTUI rely heavily on flexbox-like structures via `<Box flexDirection="...">`. Use existing `routes/` for inspiration.

## Quick Search Commands

### Find Components
```bash
# Find route components
rg -n "export (function|const) .*Route" src/routes

# Find core UI widgets
rg -n "export (function|const) .*" src/components
```

### Find Tests
```bash
# Locate core logic tests
find src/core -name "*.test.ts"
```

## Common Gotchas

- **OpenTUI Flexbox**: OpenTUI's layout engine can sometimes behave differently than browser DOM (e.g., text wrapping, overflow). Always test visual changes directly via `bunx skillcat`.
- **Pure Read-Only OS**: Never invoke `fs.rmSync`, `fs.renameSync`, or destructive operations during the TUI render lifecycle. All state mutation happens downstream in the Python migration logic.
- **Test Runner Context**: The Node test runner uses `node --import tsx`, ensure all test files are named `.test.ts`.

## Testing Guidelines

### Unit Tests
- Location: Colocated in `src/core/`
- Framework: Node Native Test Runner
- Focus: Test intelligence caches, directory readers (mocked), and state transition logic.
- Run via: `node --import tsx --test`
