<p align="center">
  <img src="icons/twist-cli.png" alt="Twist CLI" width="150" height="150" />
</p>

# Twist CLI

A command-line interface for Twist.

## Installation

> ```bash
> npm install -g @doist/twist-cli
> ```

### Agent Skills

Install skills for your coding agent:

```bash
tw skill install claude-code
tw skill install codex
tw skill install cursor
tw skill install gemini
tw skill install pi
tw skill install universal
```

Skills are installed to `~/<agent-dir>/skills/twist-cli/SKILL.md` (e.g. `~/.claude/` for claude-code, `~/.agents/` for universal, etc.). When updating the CLI, installed skills are updated automatically. The `universal` agent is compatible with Amp, OpenCode, and other agents that read from `~/.agents/`.

```bash
tw skill list
tw skill uninstall <agent>
```

## Uninstallation

First, remove any installed agent skills:

```bash
tw skill uninstall <agent>
```

Then uninstall the CLI:

```bash
npm uninstall -g @doist/twist-cli
```

## Local Setup

```bash
git clone https://github.com/Doist/twist-cli.git
cd twist-cli
npm install
npm run build
npm link
```

This makes the `tw` command available globally.

## Setup

```bash
tw auth login
```

This opens your browser to authenticate with Twist. Once approved, the token is stored in your OS credential manager:

- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service/libsecret

If secure storage is unavailable, the CLI warns and falls back to `~/.config/twist-cli/config.json`. Existing plaintext tokens are migrated automatically the next time the CLI reads them successfully from the config file. Non-secret settings such as the current workspace remain in the config file.

### Alternative methods

**Manual token:**

```bash
tw auth token "your-token"
```

**Environment variable:**

```bash
export TWIST_API_TOKEN="your-token"
```

`TWIST_API_TOKEN` always takes priority over the stored token.

### Auth commands

```bash
tw auth status   # check if authenticated
tw auth logout   # remove saved token
```

## Usage

```bash
tw inbox                           # inbox threads
tw inbox --unread                  # unread threads only
tw thread view <ref>               # view thread with comments
tw thread view <ref> --comment 123 # view a specific comment
tw thread reply <ref>              # reply to a thread
tw conversation unread             # list unread conversations
tw conversation view <ref>         # view conversation messages
tw msg view <ref>                  # view a conversation message
tw search "keyword"                # search across workspace
tw react thread <ref> 👍          # add reaction
tw away                            # show away status
tw away set vacation 2026-03-20    # set away until date
tw away clear                      # clear away status
```

References accept IDs (`123` or `id:123`), Twist URLs, or fuzzy names (for workspaces/users).

Run `tw --help` or `tw <command> --help` for more options.

## Shell Completions

Tab completion is available for bash, zsh, and fish:

```bash
tw completion install        # prompts for shell
tw completion install bash   # or: zsh, fish
```

Restart your shell or source your config file to activate. To remove:

```bash
tw completion uninstall
```

## Machine-readable output

All list/view commands support `--json` and `--ndjson` flags for scripting:

```bash
tw inbox --json                    # JSON array
tw inbox --ndjson                  # newline-delimited JSON
tw inbox --json --full             # include all fields
```

## Development

```bash
npm install
npm run build       # compile
npm run dev         # watch mode
npm run type-check  # type check
npm run format      # format code
npm test            # run tests
```
