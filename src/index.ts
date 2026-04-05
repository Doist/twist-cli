#!/usr/bin/env node

import { type Command, program } from 'commander'
import pkg from '../package.json' with { type: 'json' }
import { CliError } from './lib/errors.js'
import { isJsonMode } from './lib/global-args.js'
import { formatError, formatErrorJson } from './lib/output.js'
import { startEarlySpinner, stopEarlySpinner } from './lib/spinner.js'

const loadWorkspaceCommand = async () =>
    (await import('./commands/workspace.js')).registerWorkspaceCommand
const loadUserCommand = async () => (await import('./commands/user.js')).registerUserCommand
const loadChannelCommand = async () =>
    (await import('./commands/channel.js')).registerChannelCommand
const loadInboxCommand = async () => (await import('./commands/inbox.js')).registerInboxCommand
const loadThreadCommand = async () =>
    (await import('./commands/thread/index.js')).registerThreadCommand
const loadConversationCommand = async () =>
    (await import('./commands/conversation/index.js')).registerConversationCommand
const loadMsgCommand = async () => (await import('./commands/msg/index.js')).registerMsgCommand
const loadCommentCommand = async () =>
    (await import('./commands/comment/index.js')).registerCommentCommand
const loadSearchCommand = async () => (await import('./commands/search.js')).registerSearchCommand
const loadReactCommand = async () => (await import('./commands/react.js')).registerReactCommand
const loadAuthCommand = async () => (await import('./commands/auth/index.js')).registerAuthCommand
const loadSkillCommand = async () =>
    (await import('./commands/skill/index.js')).registerSkillCommand
const loadViewCommand = async () => (await import('./commands/view.js')).registerViewCommand
const loadCompletionCommand = async () =>
    (await import('./commands/completion/index.js')).registerCompletionCommand
const loadAwayCommand = async () => (await import('./commands/away/index.js')).registerAwayCommand
const loadUpdateCommand = async () =>
    (await import('./commands/update/index.js')).registerUpdateCommand
const loadChangelogCommand = async () =>
    (await import('./commands/changelog.js')).registerChangelogCommand

const commands: Record<string, [string, () => Promise<(p: Command) => void>]> = {
    workspaces: ['List all workspaces', loadWorkspaceCommand],
    workspace: ['Manage workspace', loadWorkspaceCommand],
    user: ['Show current user info', loadUserCommand],
    users: ['List users in a workspace', loadUserCommand],
    channels: ['List channels in a workspace', loadChannelCommand],
    inbox: ['Show inbox threads', loadInboxCommand],
    thread: ['Thread operations', loadThreadCommand],
    conversation: ['Conversation (DM/group) operations', loadConversationCommand],
    msg: ['Conversation message operations (view, update, delete)', loadMsgCommand],
    comment: ['Thread comment operations (view, update, delete)', loadCommentCommand],
    search: ['Search content across a workspace', loadSearchCommand],
    away: ['Manage away status', loadAwayCommand],
    react: ['Add an emoji reaction (target-type: thread, comment, message)', loadReactCommand],
    unreact: ['Remove an emoji reaction (target-type: thread, comment, message)', loadReactCommand],
    auth: ['Manage authentication', loadAuthCommand],
    skill: ['Manage agent skill integrations', loadSkillCommand],
    view: ['View a Twist entity by URL', loadViewCommand],
    completion: ['Manage shell completions', loadCompletionCommand],
    update: ['Update the CLI to the latest version for the configured channel', loadUpdateCommand],
    changelog: ['Show recent changelog entries', loadChangelogCommand],
}

const commandAliases: Record<string, string> = {
    convo: 'conversation',
    message: 'msg',
}

program
    .name('tw')
    .description('Twist CLI')
    .version(pkg.version)
    .option('--no-spinner', 'Disable loading animations')
    .option('--progress-jsonl [path]', 'Output progress events as JSONL to stderr or file')
    .option(
        '--include-private-channels',
        'Include private channels in output (env: TWIST_INCLUDE_PRIVATE_CHANNELS)',
    )
    .option('--accessible', 'Add text labels to color-coded output (also: TW_ACCESSIBLE=1)')
    .option(
        '--non-interactive',
        'Disable interactive prompts (auto-detected when stdin is not a TTY)',
    )
    .option('--interactive', 'Force interactive mode even when stdin is not a TTY')
    .addHelpText(
        'after',
        `
Note for AI/LLM agents:
  Use --json or --ndjson flags for unambiguous, parseable output.
  Default JSON shows essential fields; use --full for all fields.`,
    )

// Register lightweight placeholders so --help lists all commands
for (const [name, [description]] of Object.entries(commands)) {
    const cmd = program.command(name).description(description)
    // Add aliases to placeholder commands so --help shows them
    const alias = Object.entries(commandAliases).find(([, target]) => target === name)?.[0]
    if (alias) {
        cmd.alias(alias)
    }
}

// completion-server needs the command tree to walk for completions.
// Only load the completion module + the specific command being completed
// (extracted from COMP_LINE) to keep startup fast.
if (process.argv[2] === 'completion-server') {
    const { parseCompLine } = await import('./lib/completion.js')
    const compWords = parseCompLine(process.env.COMP_LINE ?? '')
    const compCmd = compWords.find(
        (w) => !w.startsWith('-') && (w in commands || w in commandAliases),
    )
    const resolvedCompCmd = compCmd ? (commandAliases[compCmd] ?? compCmd) : undefined
    const completionLoader = commands.completion[1]

    // Build loader set so command aliases that share a module only register once.
    const loadersToRun = resolvedCompCmd
        ? [
              completionLoader,
              ...(commands[resolvedCompCmd][1] !== completionLoader
                  ? [commands[resolvedCompCmd][1]]
                  : []),
          ]
        : [...new Set(Object.values(commands).map(([, loader]) => loader))]

    for (const [name, [, loader]] of Object.entries(commands)) {
        if (!loadersToRun.includes(loader)) continue
        const idx = program.commands.findIndex((c) => c.name() === name)
        if (idx !== -1) (program.commands as Command[]).splice(idx, 1)
    }

    await Promise.all(
        loadersToRun.map(async (loader) => {
            const register = await loader()
            register(program)
        }),
    )
} else {
    // Detect which command is being invoked (resolve aliases first)
    const commandArg = process.argv
        .slice(2)
        .find((a) => !a.startsWith('-') && (a in commands || a in commandAliases))
    const commandName = commandArg ? (commandAliases[commandArg] ?? commandArg) : undefined

    if (commandName && commands[commandName]) {
        const loader = commands[commandName][1]

        // Remove all placeholders that map to the same loader to avoid
        // duplicate command registration from alias entries.
        for (const [name, [, entryLoader]] of Object.entries(commands)) {
            if (entryLoader !== loader) continue
            const idx = program.commands.findIndex((c) => c.name() === name)
            if (idx !== -1) (program.commands as Command[]).splice(idx, 1)
        }

        startEarlySpinner()
        try {
            const register = await loader()
            register(program)
        } catch (err) {
            stopEarlySpinner()
            throw err
        }
    }
}

await program
    .parseAsync()
    .catch((err: Error) => {
        stopEarlySpinner()
        if (err instanceof CliError) {
            console.error(isJsonMode() ? formatErrorJson(err) : formatError(err))
        } else {
            console.error(
                isJsonMode()
                    ? formatErrorJson('INTERNAL_ERROR', err.message)
                    : err.stack || err.message,
            )
        }
        process.exitCode = 1
    })
    .finally(() => {
        stopEarlySpinner()
    })
