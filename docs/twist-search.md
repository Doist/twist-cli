# Fuzzy User Resolution for Search

## Problem

Currently `--author` and `--to` require numeric user IDs:

```bash
tw search "test" --author 440929
```

Users should be able to pass names:

```bash
tw search "test" --author craig
```

## Behavior

1. **Single match** → resolve silently
2. **Multiple matches** → show candidates and exit with error
3. **No match** → error with suggestion to check spelling

## Example Output (Ambiguous)

```
Multiple users match "craig":
  440929  Craig Carlyle <craig@doist.com>
  527308  Craig <Craig+test@doist.com>

Use --author <id> to specify.
```

## Implementation

### 1. Create user resolver in `src/lib/refs.ts`

```typescript
export async function resolveUserRefs(refs: string, workspaceId: number): Promise<number[]>
```

- Split refs by comma
- For each ref:
  - If numeric or `id:123` format → use directly
  - Otherwise → fuzzy match against workspace users
- On ambiguity → throw error with candidates list
- On no match → throw error

### 2. Update `src/commands/search.ts`

Replace direct parseInt parsing:

```typescript
// Before
const authorIds = options.author
  ? options.author.split(',').map((id) => parseInt(id.trim(), 10))
  : undefined

// After
const authorIds = options.author ? await resolveUserRefs(options.author, workspaceId) : undefined
```

Same for `toUserIds`.

## Existing Patterns

### Getting workspace users

From `src/lib/api.ts`:

```typescript
export async function getWorkspaceUsers(workspaceId: number): Promise<User[]> {
  const client = await getTwistClient()
  return client.workspaceUsers.getWorkspaceUsers({ workspaceId })
}
```

### User type (from SDK)

```typescript
interface User {
  id: number
  name: string
  email: string
  // ...other fields
}
```

### Reference parsing pattern

From `src/lib/refs.ts`, existing `parseRef()` handles:

- `id:123` → numeric ID
- bare `123` → numeric ID
- URLs → parsed IDs

## Matching Logic

```typescript
function matchesUser(user: User, query: string): boolean {
  const q = query.toLowerCase()
  return user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
}
```

## Error Messages

```typescript
// No match
throw new Error(`No user found matching "${ref}"`)

// Multiple matches
throw new Error(
  `Multiple users match "${ref}":\n` +
    matches.map((u) => `  ${u.id}  ${u.name} <${u.email}>`).join('\n') +
    `\n\nUse numeric ID to specify.`,
)
```
