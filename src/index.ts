#!/usr/bin/env node

import { program } from 'commander'
import { registerAuthCommand } from './commands/auth.js'
import { registerChannelCommand } from './commands/channel.js'
import { registerInboxCommand } from './commands/inbox.js'
import { registerMsgCommand } from './commands/msg.js'
import { registerReactCommand } from './commands/react.js'
import { registerSearchCommand } from './commands/search.js'
import { registerThreadCommand } from './commands/thread.js'
import { registerUserCommand } from './commands/user.js'
import { registerWorkspaceCommand } from './commands/workspace.js'

program
    .name('tw')
    .description('Twist CLI')
    .version('0.1.0')
    .option('--no-spinner', 'Disable loading animations')
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

program.parse()
