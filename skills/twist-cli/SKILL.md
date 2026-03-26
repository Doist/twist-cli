---
name: twist-cli
description: "Twist messaging CLI for team communication"
---

# Twist CLI (tw)

Access Twist messaging via the `tw` CLI. Use when the user asks about their Twist workspaces, threads, messages, or wants to interact with Twist in any way.

## Setup

```bash
tw auth login                    # OAuth login (opens browser, read-write)
tw auth login --read-only        # OAuth login with read-only scope
tw auth token                    # Save API token manually (prompts securely; scope unknown, assumed write-capable)
tw auth status                   # Verify authentication + show mode
tw auth status --json            # JSON output: { id, email, name }
tw auth logout                   # Remove saved token and auth metadata
tw workspaces                    # List available workspaces
tw workspace use <ref>           # Set current workspace
tw completion install            # Install shell completions
tw update                        # Update CLI to latest version
tw changelog                     # Show recent changelog entries
```

Stored auth uses the system credential manager when available. If secure storage is unavailable, `tw` warns and falls back to `~/.config/twist-cli/config.json`. `TWIST_API_TOKEN` always takes priority over the stored token, and legacy plaintext config tokens are migrated automatically when secure storage is available.

In read-only mode (`tw auth login --read-only`), commands that modify Twist data (reply, archive, react, delete, etc.) are blocked by the CLI. Externally provided tokens (`TWIST_API_TOKEN` or `tw auth token`) are treated as unknown scope and assumed write-capable.

## View by URL

```bash
tw view <url>                    # View any Twist entity by URL
```

Routes automatically based on URL structure:
- Message URL → `tw msg view`
- Conversation URL → `tw conversation view`
- Thread+comment URL → `tw thread view` (comment ID extracted from URL)
- Thread URL → `tw thread view`

All target command flags pass through (e.g. `--json`, `--raw`, `--full`).

## Inbox

```bash
tw inbox                         # Show inbox threads
tw inbox --unread                # Only unread threads
tw inbox --channel <filter>      # Filter by channel name (fuzzy)
tw inbox --since <date>          # Filter by date (ISO format)
tw inbox --limit <n>             # Max items (default: 50)
```

## Threads

```bash
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
tw thread create <channel-ref> "Title" "content" --dry-run  # Preview without posting
tw thread reply <ref> "content"  # Post a comment
tw thread reply <ref> "content" --notify EVERYONE  # Notify all workspace members
tw thread reply <ref> "content" --notify 123,id:456   # Notify specific user IDs
tw thread reply <ref> "content" --json  # Post and return comment as JSON
tw thread reply <ref> "content" --json --full  # Include all comment fields
tw thread done <ref>             # Archive thread (mark done)
tw thread done <ref> --json      # Archive and return status as JSON
```

Default `--notify` for reply is EVERYONE_IN_THREAD. Options: EVERYONE, EVERYONE_IN_THREAD, or comma-separated user ID refs.

## Conversations (DMs/Groups)

```bash
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
```

Alias: `tw convo` works the same as `tw conversation`.

## Conversation Messages

```bash
tw msg <message-ref>             # View a message (shorthand for view)
tw msg view <message-ref>        # View a single conversation message
tw msg update <ref> "content"    # Edit a conversation message
tw msg update <ref> "content" --json  # Edit and return updated message as JSON
tw msg update <ref> "content" --json --full  # Include all message fields
tw msg delete <ref>              # Delete a conversation message
tw msg delete <ref> --json       # Delete and return status as JSON
```

Alias: `tw message` works the same as `tw msg`.

## Search

```bash
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
```

## Users & Channels

```bash
tw user                          # Show current user info
tw users                         # List workspace users
tw users --search <text>         # Filter by name/email
tw channels                      # List workspace channels
```

## Away Status

```bash
tw away                          # Show current away status
tw away set <type> [until]       # Set away (type: vacation, parental, sickleave, other)
tw away set vacation 2026-03-20  # Away until March 20
tw away set vacation 2026-03-20 --from 2026-03-15  # Custom start date
tw away clear                    # Clear away status
```

## Reactions

```bash
tw react thread <ref> 👍         # Add reaction to thread
tw react comment <ref> +1        # Add reaction (shortcode)
tw react message <ref> heart     # Add reaction to DM message
tw unreact thread <ref> 👍       # Remove reaction
```

Supported shortcodes: +1, -1, heart, tada, smile, laughing, thinking, fire, check, x, eyes, pray, clap, rocket, wave

## Shell Completions

```bash
tw completion install            # Install tab completions (prompts for shell)
tw completion install bash       # Install for specific shell
tw completion install zsh
tw completion install fish
tw completion uninstall          # Remove completions
```

### Update

```bash
tw update                        # Update CLI to latest version
tw update --check                # Check for updates without installing
```

### Changelog
```bash
tw changelog                     # Show last 5 versions
tw changelog -n 3                # Show last 3 versions
tw changelog --count 10          # Show last 10 versions
```

## Global Options

```bash
--no-spinner       # Disable loading animations
--progress-jsonl   # Machine-readable progress events (JSONL to stderr)
--accessible       # Add text labels to color-coded output (also: TW_ACCESSIBLE=1)
```

## Output Formats

All list/view commands support:

```bash
--json    # Output as JSON
--ndjson  # Output as newline-delimited JSON (for streaming)
--full    # Include all fields (default shows essential fields only)
```

## Reference System

Commands accept flexible references:
- **Numeric IDs**: `123` or `id:123`
- **Twist URLs**: Full `https://twist.com/...` URLs (parsed automatically)
- **Fuzzy names**: For workspaces/users - `"My Workspace"` or partial matches

## Piping Content

Commands that accept content (`thread create`, `thread reply`, `conversation reply`, `msg update`) auto-detect piped stdin:

```bash
cat notes.md | tw thread reply <ref>
tw thread create <channel-ref> "Title" < body.md
echo "Quick reply" | tw conversation reply <ref>
```

If no content argument is provided and no stdin is piped, the CLI opens `$EDITOR` for interactive input.

## Common Workflows

**View by URL (auto-routes to the right command):**
```bash
tw view https://twist.com/a/1585/ch/100/t/200          # View thread
tw view https://twist.com/a/1585/ch/100/t/200/c/300     # View comment
tw view https://twist.com/a/1585/msg/400                 # View conversation
tw view https://twist.com/a/1585/msg/400/m/500 --json    # View message as JSON
```

**Check inbox and respond:**
```bash
tw inbox --unread --json
tw thread view <id> --unread
tw thread reply <id> "Thanks, I'll look into this."
tw thread done <id>
```

**Search and review:**
```bash
tw search "deployment" --type threads --json
tw thread view <thread-id>
```

**Check DMs:**
```bash
tw conversation unread --json
tw conversation view <conversation-id>
tw conversation with "Alice Example"
tw conversation reply <id> "Got it, thanks!"
```
