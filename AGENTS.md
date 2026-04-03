# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript to dist/ (uses tsconfig.build.json, excludes tests)
npm run dev            # Watch mode compilation (uses tsconfig.build.json, excludes tests)
npm test               # Run all tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run type-check     # Type check without emitting (uses tsconfig.json, includes tests)
npm run lint           # Fix lint issues (oxlint) + format (oxfmt)
npm run lint:check     # Check lint + formatting (for CI)
```

The project uses two tsconfig files: `tsconfig.json` includes test files for type-checking, while `tsconfig.build.json` extends it and excludes `src/__tests__/` so that test files are not compiled into `dist/`.

Run a single test file:

```bash
npx vitest run src/__tests__/lib/refs.test.ts
```

Run the CLI locally:

```bash
node dist/index.js <command>
# or after build:
./dist/index.js <command>
```

## Architecture

This is a TypeScript CLI (`tw`) for Twist messaging, built with Commander.js.

**Entry point**: `src/index.ts` registers all commands with Commander.

**Commands** (`src/commands/`): Commands with multiple subcommands use a folder-based structure (`src/commands/<entity>/index.ts`) where the index file exports a `register*Command(program)` function and wires Commander subcommands to handler functions in sibling files. Single-command files remain as flat files (`src/commands/<entity>.ts`). Each subcommand handler file exports one async action function and imports from `../../lib/`. An optional `helpers.ts` holds shared constants/utilities used by multiple subcommands. Commands support `--json`, `--ndjson`, and `--full` flags for machine-readable output.

**Lib** (`src/lib/`):

- `api.ts` - Singleton TwistApi client from `@doist/twist-sdk`, workspace/user caching
- `refs.ts` - Reference parsing: accepts IDs (`id:123` or bare `123`), Twist URLs, or fuzzy names for workspaces/users
- `output.ts` - JSON/NDJSON formatting with essential field filtering per entity type
- `config.ts` - Persists config to `~/.config/twist-cli/config.json`
- `auth.ts` - Token loading/saving/clearing (env var or config file)
- `markdown.ts` - Terminal markdown rendering via `marked` + `marked-terminal`
- `completion.ts` - Commander tree-walker + completion helpers for shell tab completion

**Reference system**: The CLI accepts flexible references throughout - numeric IDs, `id:` prefixed IDs, full Twist URLs (parsed via `parseTwistUrl`), or fuzzy name matching for workspaces/users.

## Key Patterns

- **Implicit view subcommand**: `tw thread <ref>` defaults to `tw thread view <ref>` via Commander's `{ isDefault: true }`. Same for `conversation` and `msg`. Edge case: if a ref matches a subcommand name (e.g., "reply"), the subcommand wins — user must use `tw thread view reply`
- **Named flag aliases**: Where commands accept positional `[workspace-ref]`, the `--workspace` flag is also accepted. Error if both positional and flag are provided
- **JSON output on mutating commands**: Mutating commands (create, update, delete, archive) should support `--json` output where it provides scripting value. Commands that return an object from the API (create/update) should also support `--full`. Commands where the API returns void should output a minimal status object (e.g. `{ id, deleted: true }` or `{ id, isArchived: true }`). Extend `MutationOptions` in `src/lib/options.ts` (which already includes `json` and `full`) rather than adding these fields ad hoc. Use `formatJson()` from `src/lib/output.ts` for the output. See `src/commands/away.ts` as the reference implementation.
- **Spinner messages**: When adding new SDK method calls, add a corresponding entry in the `API_SPINNER_MESSAGES` map in `src/lib/api.ts`. Every user-facing API call should have a spinner message so the CLI shows progress feedback.

## Error Handling

- **Never use `process.exit(1)` in command handlers.** It terminates immediately without running `finally` blocks, which leaves the early loading spinner stuck in the terminal. Use `process.exitCode = 1` followed by `return` instead �� this lets the process exit cleanly after spinner cleanup.

## Pre-commit Hooks

Lefthook runs type-check, oxlint, and oxfmt on pre-commit, tests on pre-push.

## Skill Content (Agent Command Reference)

The file `src/lib/skills/content.ts` exports `SKILL_CONTENT` — a comprehensive command reference that gets installed into AI agent skill directories via `tw skill install`. This is the source of truth that agents use to understand available CLI commands.

**Whenever commands, subcommands, flags, or options are added, updated, or removed in `src/commands/`, the `SKILL_CONTENT` in `src/lib/skills/content.ts` must be updated to match.** This includes:

- Adding new commands or subcommands with usage examples
- Adding, removing, or renaming flags and options
- Updating the Quick Reference section when new top-level commands are introduced
- Keeping examples accurate and consistent with actual CLI behavior

After updating `SKILL_CONTENT`:

1. Run `npm run build && npm run sync:skill` to regenerate `skills/twist-cli/SKILL.md` (the standalone skill file used by `npx skills add`)
2. Run `tw skill update claude-code` (and any other installed agents) to propagate changes to installed skill files

A CI check (`npm run check:skill-sync`) runs on pull requests and will fail if `skills/twist-cli/SKILL.md` is out of sync with `content.ts`.
