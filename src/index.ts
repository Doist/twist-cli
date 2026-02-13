#!/usr/bin/env node

import { type Command, program } from 'commander'
import pkg from '../package.json' with { type: 'json' }
import { startEarlySpinner, stopEarlySpinner } from './lib/spinner.js'

const commands: Record<string, [string, () => Promise<(p: Command) => void>]> = {
    workspace: [
        'Manage workspace',
        async () => (await import('./commands/workspace.js')).registerWorkspaceCommand,
    ],
    user: [
        'Show current user info',
        async () => (await import('./commands/user.js')).registerUserCommand,
    ],
    channel: [
        'List channels in a workspace',
        async () => (await import('./commands/channel.js')).registerChannelCommand,
    ],
    inbox: [
        'Show inbox threads',
        async () => (await import('./commands/inbox.js')).registerInboxCommand,
    ],
    thread: [
        'Thread operations',
        async () => (await import('./commands/thread.js')).registerThreadCommand,
    ],
    msg: [
        'Conversation (DM/group) operations',
        async () => (await import('./commands/msg.js')).registerMsgCommand,
    ],
    search: [
        'Search content across a workspace',
        async () => (await import('./commands/search.js')).registerSearchCommand,
    ],
    react: [
        'Add an emoji reaction (target-type: thread, comment, message)',
        async () => (await import('./commands/react.js')).registerReactCommand,
    ],
    auth: [
        'Manage authentication',
        async () => (await import('./commands/auth.js')).registerAuthCommand,
    ],
    skill: [
        'Manage agent skill integrations',
        async () => (await import('./commands/skill.js')).registerSkillCommand,
    ],
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
    .addHelpText(
        'after',
        `
Note for AI/LLM agents:
  Use --json or --ndjson flags for unambiguous, parseable output.
  Default JSON shows essential fields; use --full for all fields.`,
    )

// Register lightweight placeholders so --help lists all commands
for (const [name, [description]] of Object.entries(commands)) {
    program.command(name).description(description)
}

// Detect which command is being invoked
const commandName = process.argv.slice(2).find((a) => !a.startsWith('-') && a in commands)

if (commandName && commands[commandName]) {
    // Remove the placeholder so the real registration can take its place
    const idx = program.commands.findIndex((c) => c.name() === commandName)
    if (idx !== -1) (program.commands as Command[]).splice(idx, 1)

    const loader = commands[commandName][1]

    startEarlySpinner()
    try {
        const register = await loader()
        register(program)
    } catch (err) {
        stopEarlySpinner()
        throw err
    }
}

try {
    await program.parseAsync()
} finally {
    stopEarlySpinner()
}
