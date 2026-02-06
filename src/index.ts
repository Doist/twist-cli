#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { program } from 'commander'
import { registerAuthCommand } from './commands/auth.js'
import { registerChannelCommand } from './commands/channel.js'
import { registerInboxCommand } from './commands/inbox.js'
import { registerMsgCommand } from './commands/msg.js'
import { registerReactCommand } from './commands/react.js'
import { registerSearchCommand } from './commands/search.js'
import { registerSkillCommand } from './commands/skill.js'
import { registerThreadCommand } from './commands/thread.js'
import { registerUserCommand } from './commands/user.js'
import { registerWorkspaceCommand } from './commands/workspace.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

program
    .name('tw')
    .description('Twist CLI')
    .version(version)
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

registerWorkspaceCommand(program)
registerUserCommand(program)
registerChannelCommand(program)
registerInboxCommand(program)
registerThreadCommand(program)
registerMsgCommand(program)
registerSearchCommand(program)
registerReactCommand(program)
registerAuthCommand(program)
registerSkillCommand(program)

program.parse()
