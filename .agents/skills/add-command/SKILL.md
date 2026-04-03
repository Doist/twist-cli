---
name: add-command
description: Guide for adding new CLI commands or subcommands to twist-cli. Use when implementing new SDK endpoints, adding subcommands to existing command groups, or extending CLI functionality.
---

# Adding a New CLI Command or Subcommand

Follow this checklist when adding new commands. Each step references the exact file to modify.

## 1. Spinner Messages (`src/lib/api.ts`)

Add an entry to `API_SPINNER_MESSAGES` for each new SDK method.

Color convention:

- `blue` — read/fetch operations (e.g., loading threads, listing channels)
- `green` — create/join operations (e.g., creating a thread, starting a conversation)
- `yellow` — update/delete/archive mutations (e.g., muting, deleting, archiving)

## 2. Read-Only Permissions (`src/lib/permissions.ts`)

If the new command uses a **read-only** SDK method (e.g., `getXxx`, `listXxx`), add it to the `KNOWN_SAFE_API_METHODS` set. This set uses a default-deny approach: any method **not** listed is treated as mutating and will be blocked when the CLI is authenticated with a read-only OAuth token (`tw auth login --read-only`).

- **Read-only methods** (fetch/list/view): add to `KNOWN_SAFE_API_METHODS`
- **Mutating methods** (create/update/delete/archive/mute): do NOT add — they are blocked by default, which is the correct behavior

## 3. Command Implementation (`src/commands/<entity>/`)

Commands with multiple subcommands use a folder-based structure:

```
src/commands/<entity>/
  index.ts          # registerXxxCommand — creates parent cmd, wires subcommands
  list.ts           # async function listXxx(...) — one file per subcommand
  view.ts           # async function viewXxx(...)
  create.ts         # async function createXxx(...)
  helpers.ts        # shared constants/utilities used by multiple subcommands (optional)
```

- **index.ts**: Imports all subcommand handlers, creates the Commander tree, exports `registerXxxCommand`
- **Subcommand files**: Export one async action handler + any option interfaces. Use `../../lib/` for lib imports. No Commander imports (only index.ts uses Commander).
- **helpers.ts**: Only needed when multiple subcommands share a utility/constant.

Single-subcommand commands (e.g., `channel.ts`, `inbox.ts`) remain as flat files.

### Adding a subcommand to an existing command

1. Create a new file `src/commands/<entity>/<action>.ts` with the handler function
2. Import and wire it in `src/commands/<entity>/index.ts`

### Flag conventions

| Command type                   | Flags                                    |
| ------------------------------ | ---------------------------------------- |
| Read-only                      | `--json` (and `--ndjson` for lists)      |
| Mutating (returns entity)      | `--json` (use `formatJson`), `--dry-run` |
| Mutating (no return)           | `--dry-run`                              |
| Destructive + irreversible     | `--yes`, `--dry-run`                     |
| Reversible (archive/unarchive) | `--dry-run` (no `--yes`)                 |

### ID resolution

- `resolveThreadId(ref)` — resolve thread by numeric ID or Twist URL
- `resolveChannelId(ref)` — resolve channel by numeric ID, URL, or fuzzy name
- `resolveWorkspaceRef(ref)` — resolve workspace by ID or fuzzy name
- `resolveConversationId(ref)` — resolve conversation by numeric ID or URL
- `parseRef(ref)` — low-level parser: returns `{ type: 'id' | 'url' | 'name', ... }`

Add new resolver wrappers in `refs.ts` when needed.

### Subcommand registration pattern

```typescript
const myCmd = parent
    .command('my-action [ref]')
    .description('Do something')
    .option('--json', 'Output as JSON')
    .option('--dry-run', 'Preview what would happen without executing')
    .action((ref, options) => {
        if (!ref) {
            myCmd.help()
            return
        }
        return myAction(ref, options)
    })
```

The variable assignment (`const myCmd = ...`) is needed so the `.action()` callback can call `myCmd.help()` when the argument is missing.

### Implicit view subcommand

For entity commands with a `view` subcommand, mark it as the default so `tw thread 123` maps to `tw thread view 123`:

```typescript
thread
    .command('view [thread-ref]', { isDefault: true })
    .description('Display a thread with its comments')
    .action((ref, options) => viewThread(ref, options))
```

### Named flag aliases

Where commands accept positional `[workspace-ref]`, also accept a `--workspace` flag. Error if both are provided:

```typescript
if (workspaceRef && options.workspace) {
    throw new Error('Cannot specify workspace both as argument and --workspace flag')
}
const ref = workspaceRef ?? options.workspace
```

### Error handling

**Never use `process.exit(1)` in command handlers.** It terminates immediately without running `finally` blocks, leaving the spinner stuck. Use `process.exitCode = 1` followed by `return` instead.

### Lazy loading

New top-level commands must be registered in `src/index.ts` using the lazy loading pattern:

```typescript
const loadMyCommand = async () => (await import('./commands/my-entity/index.js')).registerMyCommand

const commands: Record<string, [string, () => Promise<(p: Command) => void>]> = {
    // ... existing commands
    'my-entity': ['My entity operations', loadMyCommand],
}
```

## 4. Accessibility (`src/lib/output.ts`)

The CLI supports accessible mode via `isAccessible()` (checks `TW_ACCESSIBLE=1` or `--accessible` flag). When adding output that uses color or visual elements, consider whether information is conveyed **only** by color or decoration.

### When to add accessible alternatives

- **Color-coded status/severity**: If color conveys meaning (e.g., green=good, red=bad), add a text prefix or label in accessible mode so the meaning is available without color.
- **ASCII art / visual bars**: Omit entirely in accessible mode — screen readers read each character individually. Show only the numeric value instead.
- **Decorative symbols**: Stars, checkmarks, or icons used alongside color should have text equivalents.

### When you don't need to do anything

- **Text that is already descriptive**: Status names like `archived`, `muted` are self-explanatory.
- **Plain numbers and dates**: Already accessible.
- **Dim/styled labels**: `chalk.dim()` for secondary info is fine — screen readers ignore styling.

### Pattern

```typescript
import { isAccessible } from '../lib/output.js'

const a11y = isAccessible()
const prefix = a11y ? '[!] ' : ''
console.log(chalk.yellow(`${prefix}Warning: thread is archived`))
```

## 5. Tests (`src/__tests__/<entity>.test.ts`)

Tests mock the API layer directly using `vi.mock` and `vi.hoisted`. Follow the existing pattern in test files like `thread.test.ts` or `conversation.test.ts`.

### Test setup pattern

```typescript
const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
}))

vi.mock('../lib/api.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/api.js')>()),
    getTwistClient: apiMocks.getTwistClient,
}))

vi.mock('../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => text),
}))

vi.mock('chalk')
```

### Creating mock clients

Build a mock client object that matches the SDK structure:

```typescript
function createClient({ thread, comments, channel } = {}) {
    return {
        threads: {
            getThread: vi.fn().mockResolvedValue(thread),
            createThread: vi.fn().mockResolvedValue(thread),
        },
        channels: {
            getChannel: vi.fn().mockResolvedValue(channel),
        },
        // ... add mock methods as needed
    }
}
```

### Always test

- Happy path (correct output, correct API call)
- `--dry-run` for mutating commands (API method should NOT be called, preview text shown)
- `--json` output where applicable
- Error cases (missing required refs, invalid input)

## 6. Skill Content (`src/lib/skills/content.ts`)

Update `SKILL_CONTENT` with examples for the new command. Update relevant sections:

- Command examples in the entity's `### Section` block
- Quick Reference if adding a top-level command
- Mutating `--json` list if the command returns an entity
- `--dry-run` list if applicable

## 7. Sync Skill File

After all code changes are complete:

```bash
npm run build && npm run sync:skill
```

This builds the project and regenerates `skills/twist-cli/SKILL.md` from the compiled skill content. The regenerated file must be committed. CI will fail (`npm run check:skill-sync`) if it is out of sync.

## 8. Verify

```bash
npm run type-check
npm test
npm run lint:check
```
