# twist-cli Specification

A command-line interface for Twist, following the architecture and patterns established by `todoist-cli`.

## Tech Stack

- **Runtime**: Node.js ≥ 18
- **Language**: TypeScript 5.x (strict mode)
- **CLI Framework**: Commander.js
- **Terminal Styling**: chalk
- **API Client**: `@doist/twist-sdk`
- **Testing**: vitest
- **Formatting**: prettier
- **Git Hooks**: lefthook

## Project Structure

```
src/
├── index.ts                 # Entry point, command registration
├── commands/                # Command implementations
│   ├── inbox.ts            # Inbox threads
│   ├── thread.ts           # Thread view, reply, done
│   ├── conversation.ts     # Conversations (DMs/group messages)
│   ├── msg.ts              # Conversation message operations
│   ├── workspace.ts        # Workspace listing and selection
│   ├── user.ts             # User info/listing
│   ├── search.ts           # Content search
│   ├── channel.ts          # Channel listing
│   └── react.ts            # Emoji reactions
└── lib/                     # Shared utilities
    ├── api.ts              # API client wrapper, caching
    ├── auth.ts             # Token management
    ├── config.ts           # Config file management (current workspace)
    ├── output.ts           # Formatting (colors, JSON, markdown)
    ├── refs.ts             # Reference resolution (ID/URL parsing)
    ├── pagination.ts       # Timestamp-based pagination
    └── dates.ts            # Relative date formatting

__tests__/                   # Test suite
```

## Package & Binary

- **Package name**: `@doist/twist-cli`
- **Binary**: `tw`

## Authentication

Token resolution (priority order):

1. Environment variable: `TWIST_API_TOKEN`
2. System credential manager (Keychain, Credential Manager, or Secret Service)
3. Legacy plaintext token in `~/.config/twist-cli/config.json` during auto-migration
4. Plaintext config fallback when the OS credential store is unavailable

## Workspace Scoping

Commands that require a workspace context use this resolution order:

1. `--workspace <ref>` flag (if provided)
2. Config-stored current workspace (`tw workspace use <ref>`)
3. User's default workspace from API (auto-stored to config on first use)

---

## Commands

### Workspace Commands

#### `tw workspaces`

List all workspaces the user belongs to.

Options:

- `--json` / `--ndjson` - Machine-readable output

#### `tw workspace use <workspace-ref>`

Set the current workspace for subsequent commands.

Arguments:

- `workspace-ref` - Workspace ID or name

---

### User Commands

#### `tw user`

Display current user info (name, email, timezone, default workspace).

#### `tw users [workspace-ref]`

List users in a workspace.

Arguments:

- `workspace-ref` - Workspace ID or name (uses current workspace if omitted)

Options:

- `--search <text>` - Filter by name/email
- `--json` / `--ndjson` - Machine-readable output

---

### Channel Commands

#### `tw channels [workspace-ref]`

List channels in a workspace.

Arguments:

- `workspace-ref` - Workspace ID or name (uses current workspace if omitted)

Options:

- `--json` / `--ndjson` - Machine-readable output

---

### Inbox Commands

#### `tw inbox [workspace-ref]`

Show inbox threads (mirrors Twist UI inbox - threads only, not DMs).

Arguments:

- `workspace-ref` - Workspace ID or name (uses current workspace if omitted)

Options:

- `--unread` - Only show unread threads
- `--since <date>` - Filter by date (ISO format)
- `--until <date>` - Filter by date
- `--limit <n>` - Max items (default: 50)
- `--json` / `--ndjson` - Machine-readable output

Output format (human-readable):

- Title, channel name, timestamp (relative), unread indicator
- URL on second line for each entry
- Content truncated in list view

---

### Thread Commands

#### `tw thread view <thread-ref>`

Display a thread with its comments.

Arguments:

- `thread-ref` - Thread ID or Twist URL

Options:

- `--limit <n>` - Max comments to show (default: 50)
- `--since <date>` - Comments newer than
- `--until <date>` - Comments older than
- `--raw` - Show raw markdown instead of rendered
- `--json` / `--ndjson` - Machine-readable output

Output:

- Full thread content with markdown rendered (unless `--raw`)
- Comments with full content (detail view = no truncation)

#### `tw thread reply <thread-ref> [content]`

Post a comment to a thread.

Arguments:

- `thread-ref` - Thread ID or Twist URL
- `content` - Comment content (optional if using stdin or editor)

Content input priority:

1. Stdin (if piped: `echo "text" | tw thread reply id:123`)
2. Argument (if provided)
3. Opens `$EDITOR` (if neither stdin nor argument)

Options:

- `--dry-run` - Show what would be posted without posting

Output:

- Minimal confirmation with comment-specific URL

#### `tw thread done <thread-ref>`

Archive a thread (mark as done).

Arguments:

- `thread-ref` - Thread ID or Twist URL

Options:

- `--yes` - Confirm archive (required to execute)
- `--dry-run` - Show what would happen without executing

---

### Conversation Commands

Alias: `convo`. Conversations are DM/group containers.

#### `tw conversation unread [workspace-ref]`

List unread conversations.

Arguments:

- `workspace-ref` - Workspace ID or name (uses current workspace if omitted)

Options:

- `--json` / `--ndjson` - Machine-readable output

Output format:

- Participants + unread count (e.g., "Conversation with John, Jane (3 unread)")
- URL on second line
- No message preview (privacy)

#### `tw conversation view <conversation-ref>`

Display a conversation with its messages.

Arguments:

- `conversation-ref` - Conversation ID or Twist URL

Options:

- `--limit <n>` - Max messages to show (default: 50)
- `--since <date>` - Messages newer than
- `--until <date>` - Messages older than
- `--raw` - Show raw markdown instead of rendered
- `--json` / `--ndjson` - Machine-readable output

#### `tw conversation reply <conversation-ref> [content]`

Send a message in a conversation.

Arguments:

- `conversation-ref` - Conversation ID or Twist URL
- `content` - Message content (optional if using stdin or editor)

Content input: Same as `tw thread reply` (stdin → arg → $EDITOR)

Options:

- `--dry-run` - Show what would be sent without sending

Output:

- Minimal confirmation with message-specific URL

#### `tw conversation done <conversation-ref>`

Archive a conversation.

Arguments:

- `conversation-ref` - Conversation ID or Twist URL

Options:

- `--yes` - Confirm archive (required to execute)
- `--dry-run` - Show what would happen without executing

---

### Conversation Message Commands

Alias: `message`. Operations on individual messages within conversations.

#### `tw msg view <message-ref>`

View a single conversation message.

Arguments:

- `message-ref` - Message ID or Twist URL

Options:

- `--raw` - Show raw markdown instead of rendered
- `--json` / `--ndjson` - Machine-readable output

#### `tw msg update <message-ref> [content]`

Edit a conversation message.

Arguments:

- `message-ref` - Message ID or Twist URL
- `content` - New message content (optional if using stdin or editor)

Content input: Same as `tw thread reply` (stdin → arg → $EDITOR)

Options:

- `--dry-run` - Show what would be updated without updating

#### `tw msg delete <message-ref>`

Delete a conversation message.

Arguments:

- `message-ref` - Message ID or Twist URL

Options:

- `--yes` - Confirm deletion (required to execute)
- `--dry-run` - Show what would happen without executing

---

### Search Commands

#### `tw search <query> [workspace-ref]`

Search content across a workspace.

Arguments:

- `query` - Search query
- `workspace-ref` - Workspace ID or name (uses current workspace if omitted)

Options:

- `--channel <channel-refs>` - Filter by channels (comma-separated IDs)
- `--author <user-refs>` - Filter by author (comma-separated IDs)
- `--mention-me` - Only results mentioning current user
- `--since <date>` - Content from date
- `--until <date>` - Content until date
- `--limit <n>` - Max results (default: 50)
- `--cursor <cursor>` - Pagination cursor
- `--json` / `--ndjson` - Machine-readable output

---

### Reaction Commands

#### `tw react <target-type> <target-ref> <emoji>`

Add an emoji reaction.

Arguments:

- `target-type` - One of: `thread`, `comment`, `message`
- `target-ref` - Target ID
- `emoji` - Emoji shortcode (`+1`, `heart`) or actual emoji (`👍`)

Options:

- `--dry-run` - Show what would happen without executing

Output displays actual emoji character.

#### `tw unreact <target-type> <target-ref> <emoji>`

Remove an emoji reaction.

Arguments:

- Same as `tw react`

Options:

- `--dry-run` - Show what would happen without executing

---

## Reference Resolution

Commands support these reference formats:

- `id:123456` - Direct ID lookup
- `123456` - Bare ID (when unambiguous context)
- Full Twist URLs - Parsed to extract IDs
- `"Workspace Name"` - Name matching for workspaces only (case-insensitive)

Threads, comments, messages, and conversations: **ID or URL only** (no name lookup).

---

## Output Formatting

### Human-Readable (Default)

**Timestamps**: Relative format ("2 hours ago", "yesterday", "Jan 5")

**Content rendering**:

- Full markdown rendering by default (bold, code blocks, etc.)
- `--raw` flag shows raw markdown
- Markdown library choice deferred - start with raw, add rendering later

**Truncation**:

- List views (inbox, search): Truncate long content
- Detail views (thread view, msg view): Show full content

**Colors**:

- Unread: bold
- Creator/author: cyan
- Timestamps: dim
- Channel names: blue

### Machine-Readable

- `--json` - Pretty-printed JSON with metadata
- `--ndjson` - Newline-delimited JSON (one object per line)
- `--full` - Include all fields (default shows essential fields)

### Essential Fields by Entity

**Thread**: id, title, channelId, channelName, workspaceId, creator, posted, commentCount, isArchived, inInbox, isUnread, url

**Comment**: id, content, creator, threadId, posted, url

**Conversation**: id, workspaceId, userIds, participantNames, title, messageCount, lastActive, archived, url

**Message**: id, content, creator, conversationId, posted, url

**Workspace**: id, name, creator, plan

**User**: id, name, email, timezone, userType

**Channel**: id, name, workspaceId

---

## Pagination

Timestamp-based pagination for threads, comments, messages:

- `--since <date>` / `--until <date>` - Filter by time range
- `--limit <n>` - Max items per request

Cursor-based pagination for search:

- `--cursor <cursor>` - Resume from cursor
- Output includes `nextCursor` when more results available

---

## Error Handling

- Clear error messages without hints (minimal)
- Exit codes: 0=success, 1=error
- Errors written to stderr

---

## Config File

Location: `~/.config/twist-cli/config.json`

```json
{
    "currentWorkspace": 12345
}
```

`token` may appear temporarily in legacy installs before migration, or as a fallback when the system credential manager is unavailable.

---

## Examples

```bash
# Set current workspace
tw workspace use "My Team"

# View inbox
tw inbox
tw inbox --unread

# View a thread
tw thread view id:123456
tw thread view https://twist.com/a/12345/ch/67890/t/123456

# Reply to a thread
tw thread reply id:123456 "Great idea!"
echo "Multiline\nreply" | tw thread reply id:123456
tw thread reply id:123456  # opens $EDITOR

# Mark thread as done
tw thread done id:123456 --yes

# List unread conversations
tw conversation unread

# View and reply to a conversation
tw conversation view id:456789
tw conversation reply id:456789 "Thanks!"

# Search
tw search "quarterly report"
tw search "bug fix" --author id:123 --since 2024-01-01

# React to content
tw react thread id:123456 +1
tw react comment id:789 👍
tw unreact message id:456 heart

# List channels and users
tw channels
tw users --search "john"

# Dry run before mutating
tw thread reply id:123 "test" --dry-run
tw thread done id:123 --dry-run

# JSON output for scripting
tw inbox --json
tw search "project" --ndjson
```

---

## Not in MVP (Future Considerations)

- `tw conversation start` - Start new conversations
- `tw thread done --all` - Bulk archive
- `tw link` command - URLs shown in output instead
- `tw open` - Open in browser
- `tw star` / `tw mute` - Star/mute content
- `tw unread` - Unified unread view (threads + messages)

---

## Implementation Notes

1. **API Client Singleton**: Lazy-initialize `TwistClient` on first use

2. **Workspace Caching**: Cache current workspace in config, auto-fetch from API default if not set

3. **URL Parsing**: Support full Twist URLs, extract workspace/channel/thread/comment/conversation/message IDs

4. **Batch Operations**: Use `client.batch()` for parallel API calls when fetching related data (channels, users for display)

5. **Content Input**: For reply commands, check stdin first, then arg, then spawn $EDITOR

6. **Markdown Rendering**: Defer library choice. Start with raw markdown, add terminal rendering later based on real usage
