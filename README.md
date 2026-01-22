# Twist CLI

A command-line interface for Twist.

## Installation

> **Note**: This package is not yet published to npm. Once published, install with:
>
> ```bash
> npm install -g @doist/twist-cli
> ```

### Local Setup (for now)

```bash
git clone https://github.com/Doist/twist-cli.git
cd twist-cli
npm install
npm run build
npm link
```

This makes the `tw` command available globally.

## Setup

Save your Twist API token:

```bash
tw login token "your-token"
```

Alternatively, set via environment variable:

```bash
export TWIST_API_TOKEN="your-token"
```

## Usage

```bash
tw workspaces                      # list all workspaces
tw inbox                           # inbox threads
tw inbox --unread                  # unread threads only
tw thread view <thread-ref>        # view thread with comments
tw thread reply <thread-ref>       # reply to a thread
tw msg list                        # list conversations
tw msg view <conversation-ref>     # view conversation messages
tw search "keyword"                # search across workspace
tw react thread <ref> 👍           # add reaction
```

References accept IDs (`123` or `id:123`), Twist URLs, or fuzzy names (for workspaces/users).

Run `tw --help` or `tw <command> --help` for more options.

### Machine-readable output

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
