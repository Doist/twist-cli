# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode compilation
npm test               # Run all tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run type-check     # Type check without emitting
npm run format         # Format with Prettier
npm run format:check   # Check formatting
```

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

**Commands** (`src/commands/`): Each file exports a `register*Command(program)` function. Commands support `--json`, `--ndjson`, and `--full` flags for machine-readable output.

**Lib** (`src/lib/`):

- `api.ts` - Singleton TwistApi client from `@doist/twist-sdk`, workspace/user caching
- `refs.ts` - Reference parsing: accepts IDs (`id:123` or bare `123`), Twist URLs, or fuzzy names for workspaces/users
- `output.ts` - JSON/NDJSON formatting with essential field filtering per entity type
- `config.ts` - Persists config to `~/.config/twist-cli/config.json`
- `auth.ts` - Token retrieval
- `markdown.ts` - Terminal markdown rendering via `marked` + `marked-terminal`

**Reference system**: The CLI accepts flexible references throughout - numeric IDs, `id:` prefixed IDs, full Twist URLs (parsed via `parseTwistUrl`), or fuzzy name matching for workspaces/users.

## Pre-commit Hooks

Lefthook runs type-check and prettier on pre-commit, tests on pre-push.
