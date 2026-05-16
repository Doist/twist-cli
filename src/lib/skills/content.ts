import packageJson from '../../../package.json' with { type: 'json' }

export const SKILL_NAME = 'twist-cli'

export const SKILL_DESCRIPTION =
    'Twist messaging CLI. View and respond to inbox threads, channel threads, direct messages, mentions, and group conversations; search, react, archive, mute, and manage workspaces. Use when the user mentions Twist, asks about their inbox, mentions, threads, DMs, channels, or wants to read or send Twist messages.'

export const SKILL_AUTHOR = 'Doist'

export const SKILL_LICENSE = 'MIT'

export const SKILL_VERSION = packageJson.version

export const SKILL_CONTENT = `# Twist CLI (tw)

Access Twist messaging via the \`tw\` CLI. Use when the user asks about their Twist workspaces, threads, messages, or wants to interact with Twist in any way.

## Setup

\`\`\`bash
tw auth login                    # OAuth login (opens browser, read-write)
tw auth login --read-only        # OAuth login with read-only scope
tw auth login --callback-port <n># Override the local OAuth callback port (default 8766)
tw auth login --json             # Emit a JSON envelope for scripted / agent use
tw auth login --ndjson           # Emit an NDJSON envelope for scripted / agent use
tw auth token                    # Save API token manually (prompts securely; scope unknown, assumed write-capable)
tw auth status                   # Verify authentication + show mode
tw auth status --json            # Full status payload as JSON (--ndjson also supported)
tw auth status --user <ref>      # Target a specific stored account (id, id:<n>, or display name)
tw --user <ref> auth <status|logout|token view>  # Equivalent to passing --user after the subcommand; other commands accept the flag but ignore it
tw auth logout                   # Remove saved token and auth metadata
tw auth logout --json            # Emits \`{"ok": true}\` (--ndjson is silent)
tw auth logout --user <ref>      # Target a specific stored account; mismatched ref errors with ACCOUNT_NOT_FOUND
tw auth token view               # Print the saved token to stdout (pipe-safe; refuses if TWIST_API_TOKEN is set)
tw auth token view --user <ref>  # Print the saved token for a specific stored account
tw workspaces                    # List available workspaces
tw workspace use <ref>           # Set current workspace
tw completion install            # Install shell completions
tw config view                   # Show the current CLI configuration file (token masked)
tw config set <key> <value>      # Set a user preference (e.g. unarchive-new-threads true)
tw doctor                        # Diagnose CLI setup and environment issues
tw update                        # Update CLI to latest version
tw changelog                     # Show recent changelog entries
\`\`\`

Stored auth uses the system credential manager when available. If secure storage is unavailable, \`tw\` warns and falls back to \`~/.config/twist-cli/config.json\`. \`TWIST_API_TOKEN\` always takes priority over the stored token, and legacy plaintext config tokens are migrated automatically when secure storage is available.

In read-only mode (\`tw auth login --read-only\`), commands that modify Twist data (reply, archive, react, delete, etc.) are blocked by the CLI. Externally provided tokens (\`TWIST_API_TOKEN\` or \`tw auth token\`) are treated as unknown scope and assumed write-capable.

## View by URL

\`\`\`bash
tw view <url>                    # View any Twist entity by URL
\`\`\`

Routes automatically based on URL structure:
- Message URL → \`tw msg view\`
- Conversation URL → \`tw conversation view\`
- Thread+comment URL → \`tw thread view\` (comment ID extracted from URL)
- Thread URL → \`tw thread view\`

All target command flags pass through (e.g. \`--json\`, \`--raw\`, \`--full\`).

## Inbox

\`\`\`bash
tw inbox                         # Show inbox threads
tw inbox --unread                # Only unread threads
tw inbox --archive-filter all      # Show active + done threads
tw inbox --archive-filter archived # Show only done threads
tw inbox --channel <filter>      # Filter by channel name (fuzzy)
tw inbox --since <date>          # Filter by date (ISO format)
tw inbox --limit <n>             # Max items (default: 50)
\`\`\`

## Threads

\`\`\`bash
tw thread <thread-ref>           # View thread (shorthand for view)
tw thread view <thread-ref>      # View thread with comments
tw thread view <ref> --comment <id> # View a specific comment
tw thread view <url-with-/c/id>  # Comment ID extracted from URL
tw thread view <ref> --unread    # Show only unread comments
tw thread view <ref> --context 3 # Include 3 read comments before unread
tw thread view <ref> --limit 20  # Limit number of comments
tw thread view <ref> --since <date> # Comments newer than date
tw thread view <ref> --raw       # Show raw markdown
tw thread create <channel-ref> "Title" "content"    # Create a new thread
tw thread create <channel-ref> "Title" "content" --json       # Create and return as JSON
tw thread create <channel-ref> "Title" "content" --json --full # Include all thread fields
tw thread create <channel-ref> "Title" "content" --notify 123,456  # Notify specific users
tw thread create <channel-ref> "Title" "content" --unarchive  # Land thread in author's Inbox (overrides default Twist auto-archive)
tw thread create <channel-ref> "Title" "content" --no-unarchive  # Force archive even when userSettings.unarchiveNewThreads=true
tw thread create <channel-ref> "Title" "content" --dry-run  # Preview without posting
tw thread reply <ref> "content"  # Post a comment (notifies EVERYONE_IN_THREAD by default)
tw thread reply <ref> "content" --notify EVERYONE  # Notify all workspace members
tw thread reply <ref> "content" --notify 123,id:456   # Notify specific user IDs
tw thread reply <ref> "content" --json  # Post and return comment as JSON
tw thread reply <ref> "content" --json --full  # Include all comment fields
tw thread reply <ref> "content" --close       # Reply and close the thread
tw thread reply <ref> "content" --reopen      # Reply and reopen a closed thread
tw thread done <ref>             # Archive thread (mark done)
tw thread done <ref> --json      # Archive and return status as JSON
tw thread mute <ref>             # Mute thread for 60 minutes (default)
tw thread mute <ref> --minutes 480  # Mute for custom duration
tw thread mute <ref> --json      # Mute and return { id, mutedUntil } as JSON
tw thread mute <ref> --json --full  # Mute and return full thread as JSON
tw thread unmute <ref>           # Unmute a muted thread
tw thread unmute <ref> --json    # Unmute and return { id, mutedUntil } as JSON
tw thread delete <ref>             # Preview thread deletion (requires --yes to execute)
tw thread delete <ref> --yes       # Permanently delete a thread
tw thread delete <ref> --yes --json # Delete and return status as JSON
tw thread rename <ref> "New title"  # Rename a thread (change its title)
tw thread rename <ref> "New title" --json  # Rename and return { id, title } as JSON
tw thread rename <ref> "New title" --json --full  # Rename and return full thread as JSON
tw thread update <ref> "New body"   # Update a thread's body (the first post)
echo "New body" | tw thread update <ref>  # Update body from stdin
tw thread update <ref> "New body" --dry-run  # Preview without updating
tw thread update <ref> "New body" --json  # Update and return { id, content } as JSON
tw thread update <ref> "New body" --json --full  # Update and return full thread as JSON
\`\`\`

Default \`--notify\` for reply is EVERYONE_IN_THREAD, which may notify more people than intended. Before posting, confirm with the user whether specific people should be notified instead (via \`--notify <user-ids>\`). Options: EVERYONE, EVERYONE_IN_THREAD, or comma-separated ID refs.

\`--notify\` automatically resolves IDs: group IDs are routed to the \`groups\` API field, user IDs to \`recipients\`. No special syntax needed.

## Thread Comments

\`\`\`bash
tw comment <comment-ref>                       # View a comment (shorthand for view)
tw comment view <comment-ref>                  # View a single thread comment
tw comment view <comment-ref> --raw            # Show raw markdown
tw comment view <comment-ref> --json           # Output as JSON
tw comment view <comment-ref> --ndjson         # Output as newline-delimited JSON
tw comment view <comment-ref> --json --full    # Include all fields in JSON output
tw comment update <comment-ref> "new content"  # Update a thread comment
tw comment update <comment-ref> "content" --json  # Update and return updated comment as JSON
tw comment update <comment-ref> "content" --json --full  # Include all comment fields
tw comment delete <comment-ref>                # Delete a thread comment
tw comment delete <comment-ref> --json         # Delete and return status as JSON
\`\`\`

## Conversations (DMs/Groups)

\`\`\`bash
tw conversation unread                    # List unread conversations
tw conversation <conversation-ref>        # View conversation (shorthand for view)
tw conversation view <conversation-ref>   # View conversation messages
tw conversation with <user-ref>           # Find your 1:1 DM with a user
tw conversation with <user-ref> --snippet # Include the latest message preview
tw conversation with <user-ref> --include-groups # List any conversations with that user
tw conversation reply <ref> "content"     # Send a message
tw conversation reply <ref> "content" --json  # Send and return message as JSON
tw conversation reply <ref> "content" --json --full  # Include all message fields
tw conversation done <ref>                # Archive conversation
tw conversation done <ref> --json         # Archive and return status as JSON
tw conversation mute <ref>               # Mute conversation for 60 minutes (default)
tw conversation mute <ref> --minutes 480 # Mute for custom duration
tw conversation mute <ref> --json        # Mute and return { id, mutedUntil } as JSON
tw conversation mute <ref> --json --full # Mute and return full conversation as JSON
tw conversation unmute <ref>             # Unmute a muted conversation
tw conversation unmute <ref> --json      # Unmute and return { id, mutedUntil } as JSON
\`\`\`

Alias: \`tw convo\` works the same as \`tw conversation\`.

## Conversation Messages

\`\`\`bash
tw msg <message-ref>             # View a message (shorthand for view)
tw msg view <message-ref>        # View a single conversation message
tw msg update <ref> "content"    # Edit a conversation message
tw msg update <ref> "content" --json  # Edit and return updated message as JSON
tw msg update <ref> "content" --json --full  # Include all message fields
tw msg delete <ref>              # Delete a conversation message
tw msg delete <ref> --json       # Delete and return status as JSON
\`\`\`

Alias: \`tw message\` works the same as \`tw msg\`.

## Search

\`\`\`bash
tw mentions                      # Show content mentioning current user
tw mentions --since 2026-04-01 --all # Fetch every mention since a date
tw mentions --type threads --json # Limit mentions to threads
tw search "query"                # Search content
tw search "query" --type threads # Filter: threads, messages, or all
tw search "query" --author <ref> # Filter by author
tw search "query" --to <ref>     # Messages sent to user
tw search "query" --title-only   # Search thread titles only
tw search "query" --mention-me   # Results mentioning current user
tw search "query" --conversation <refs> # Limit to conversations (comma-separated refs)
tw search "query" --since <date> # Content from date
tw search "query" --until <date> # Content until date
tw search "query" --channel <refs> # Filter by channel refs (comma-separated)
tw search "query" --limit <n>    # Max results (default: 50)
tw search "query" --cursor <cur> # Pagination cursor
tw search "query" --all          # Fetch all result pages
\`\`\`

## Users, Channels & Groups

\`\`\`bash
tw user                          # Show current user info
tw user --json                   # JSON output
tw user --json --full            # Include all fields in JSON output
tw users                         # List workspace users
tw users --search <text>         # Filter by name/email
tw channels                      # List active joined workspace channels (alias of: tw channel list)
tw channels --state all          # Include archived joined channels too
tw channels --scope discoverable # Active public channels you can see but have not joined
tw channels --scope public --state all --json # All visible public channels, with joined status
tw channel threads <channel-ref>  # List threads in a channel (fuzzy name, id:, numeric ID, or URL)
tw channel threads "general" --unread       # Only unread threads
tw channel threads <ref> --archive-filter all  # Include archived threads (active|archived|all)
tw channel threads <ref> --since 2026-01-01 # Filter by last-updated date (ISO)
tw channel threads <ref> --limit 20         # Max threads per page (default: 50)
tw channel threads <ref> --limit 20 --cursor <cursor-from-prev> # Paginate
tw channel threads <ref> --json  # { results, nextCursor } with isUnread + url
tw groups                        # List workspace groups
tw groups --search "frontend"    # Filter groups by name (case-insensitive)
tw groups --json                 # JSON output
tw groups --json --full          # Include all fields in JSON output
tw groups view <group-ref>       # Show group with member details
tw groups view <ref> --json      # JSON output with id, name, workspaceId, members
tw groups view <ref> --json --full  # Include all fields in JSON output
tw groups create "Name"          # Create a new group
tw groups create "Name" --users alice@doist.com,bob@doist.com  # Create with members
tw groups create "Name" --json   # Output created group as JSON
tw groups rename <group-ref> "New name"  # Rename a group
tw groups rename <ref> "Name" --json     # Output renamed group as JSON
tw groups delete <group-ref> --yes       # Delete a group (requires --yes)
tw groups delete <ref> --dry-run         # Preview deletion
tw groups add-user <group-ref> user1 user2   # Add users to a group
tw groups add-user <ref> a@d.com,b@d.com     # Comma-separated refs
tw groups add-user <ref> id:123 --json       # Output result as JSON
tw groups remove-user <group-ref> user1 user2  # Remove users from a group
tw groups remove-user <ref> id:123,id:456      # Comma-separated ID refs
\`\`\`

If a channel is not found in \`tw channels\`, widen with broader listings such as \`tw channels --scope public\`, then \`tw channels --scope public --state all\`. Check \`tw channels --help\` for other available filters.

\`tw channel threads\` returns every thread in the channel; pagination filters (\`--limit\`, \`--cursor\`, \`--since\`, \`--until\`, \`--unread\`) are applied client-side after fetch. \`--archive-filter\` is applied server-side. Results are sorted newest-first by last activity. In \`--json\` / \`--ndjson\`, the response includes a \`nextCursor\` string (opaque) you can pass via \`--cursor\` to fetch the next page; NDJSON emits the cursor as a final \`{ "_meta": true, "nextCursor": "..." }\` line.

## Away Status

\`\`\`bash
tw away                          # Show current away status
tw away set <type> [until]       # Set away (type: vacation, parental, sickleave, other)
tw away set vacation 2026-03-20  # Away until March 20
tw away set vacation 2026-03-20 --from 2026-03-15  # Custom start date
tw away clear                    # Clear away status
\`\`\`

## Reactions

\`\`\`bash
tw react thread <ref> 👍         # Add reaction to thread
tw react comment <ref> +1        # Add reaction (shortcode)
tw react message <ref> heart     # Add reaction to DM message
tw react thread <ref> 👍 --json  # Output result as JSON
tw unreact thread <ref> 👍       # Remove reaction
tw unreact thread <ref> 👍 --json # Output result as JSON
\`\`\`

Supported shortcodes: +1, -1, heart, tada, smile, laughing, thinking, fire, check, x, eyes, pray, clap, rocket, wave

## Shell Completions

\`\`\`bash
tw completion install            # Install tab completions (prompts for shell)
tw completion install bash       # Install for specific shell
tw completion install zsh
tw completion install fish
tw completion uninstall          # Remove completions
\`\`\`

### Diagnostics

\`\`\`bash
tw doctor                        # Run local + network diagnostics
tw doctor --offline              # Skip Twist and npm network checks
tw doctor --json                 # JSON output with per-check results
\`\`\`

### Configuration

\`\`\`bash
tw config view                   # Pretty-printed config, token masked, labels actual token source
tw config view --json            # Raw JSON, token masked
tw config view --show-token      # Include the full token
tw config set unarchive-new-threads true   # Persist: always unarchive new threads so they land in your Inbox
tw config set unarchive-new-threads false  # Persist: keep Twist's default (thread auto-archived for author)
\`\`\`

User preferences are stored under \`userSettings\` in the config file. Currently supported keys: \`unarchive-new-threads\`. The flag on \`tw thread create\` (\`--unarchive\` / \`--no-unarchive\`) overrides this default per-invocation.

### Update

\`\`\`bash
tw update                        # Update CLI to latest version
tw update --check                # Check for updates without installing, show channel
tw update --check --json         # Same, JSON envelope
tw update --check --ndjson       # Same, newline-delimited JSON envelope
tw update --channel              # Show current update channel
tw update switch --stable        # Switch to stable release channel
tw update switch --pre-release   # Switch to pre-release (next) channel
tw update switch --pre-release --json    # Same, JSON envelope
tw update switch --pre-release --ndjson  # Same, newline-delimited JSON envelope
\`\`\`

### Changelog
\`\`\`bash
tw changelog                     # Show last 5 versions
tw changelog -n 3                # Show last 3 versions
tw changelog --count 10          # Show last 10 versions
\`\`\`

## Global Options

\`\`\`bash
--no-spinner               # Disable loading animations
--progress-jsonl           # Machine-readable progress events (JSONL to stderr)
--progress-jsonl=<path>    # Same, but write events to <path> instead of stderr
--progress-jsonl <path>    # Same as above (space-separated form also accepted)
--accessible               # Add text labels to color-coded output (also: TW_ACCESSIBLE=1)
--non-interactive          # Disable interactive prompts (auto-detected when stdin is not a TTY)
--interactive              # Force interactive mode even when stdin is not a TTY
\`\`\`

## Output Formats

All list/view commands support:

\`\`\`bash
--json    # Output as JSON
--ndjson  # Output as newline-delimited JSON (for streaming)
--full    # Include all fields (default shows essential fields only)
\`\`\`

## Dry Run

Mutating commands accept \`--dry-run\` to preview the operation without making the change. Where a command performs pre-flight validation (e.g. fetching the target thread to check channel access or ownership), those checks still run in dry-run — only the mutating write is skipped. Commands that have no pre-flight validation parse the reference and print the preview without hitting the API. The preview is structured:

\`\`\`
[dry-run] Would <action>:
  <Key>: <resolved value>
  ...
Run without --dry-run to execute.
\`\`\`

## Reference System

Commands accept flexible references:
- **Numeric IDs**: \`123\` or \`id:123\`
- **Twist URLs**: Full \`https://twist.com/...\` URLs (parsed automatically)
- **Fuzzy names**: For workspaces/users - \`"My Workspace"\` or partial matches

## Piping Content

Commands that accept content (\`thread create\`, \`thread reply\`, \`comment update\`, \`conversation reply\`, \`msg update\`) auto-detect piped stdin:

\`\`\`bash
cat notes.md | tw thread reply <ref>
tw thread create <channel-ref> "Title" < body.md
echo "Quick reply" | tw conversation reply <ref>
\`\`\`

If no content argument is provided and no stdin is piped, the CLI opens \`$EDITOR\` for interactive input. In non-TTY environments (e.g. when called by an agent or in a pipeline), the editor is automatically skipped and the command fails fast with an actionable error message. Use \`--non-interactive\` to force this behavior even in a TTY, or \`--interactive\` to override auto-detection.

## Common Workflows

**View by URL (auto-routes to the right command):**
\`\`\`bash
tw view https://twist.com/a/1585/ch/100/t/200          # View thread
tw view https://twist.com/a/1585/ch/100/t/200/c/300     # View comment
tw view https://twist.com/a/1585/msg/400                 # View conversation
tw view https://twist.com/a/1585/msg/400/m/500 --json    # View message as JSON
\`\`\`

**Check inbox and respond:**
\`\`\`bash
tw inbox --unread --json
tw thread view <id> --unread
tw thread reply <id> "Thanks, I'll look into this."
tw thread done <id>
\`\`\`

**Search and review:**
\`\`\`bash
tw mentions --since 2026-04-01 --all --json
tw search "deployment" --type threads --json
tw thread view <thread-id>
\`\`\`

**Check DMs:**
\`\`\`bash
tw conversation unread --json
tw conversation view <conversation-id>
tw conversation with "Alice Example"
tw conversation reply <id> "Got it, thanks!"
\`\`\`
`

export const SKILL_FILE_CONTENT = `---
name: ${SKILL_NAME}
description: ${JSON.stringify(SKILL_DESCRIPTION)}
license: ${SKILL_LICENSE}
metadata:
  author: ${SKILL_AUTHOR}
  version: ${JSON.stringify(SKILL_VERSION)}
---

${SKILL_CONTENT}`
