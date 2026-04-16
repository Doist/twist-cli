import chalk from 'chalk'
import { Command } from 'commander'
import { getCurrentWorkspaceId, getSessionUser, getWorkspaceUsers } from '../lib/api.js'
import { CliError } from '../lib/errors.js'
import type { ViewOptions } from '../lib/options.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

type UsersOptions = ViewOptions & { workspace?: string; search?: string }

async function showCurrentUser(options: ViewOptions): Promise<void> {
    const user = await getSessionUser()

    if (options.json) {
        console.log(formatJson(user, 'user', options.full))
        return
    }

    console.log(chalk.bold(user.name))
    console.log('')
    console.log(`ID:        ${user.id}`)
    console.log(`Email:     ${user.email}`)
    console.log(`Timezone:  ${user.timezone}`)
    if (user.defaultWorkspace) {
        console.log(`Default:   workspace id:${user.defaultWorkspace}`)
    }
}

async function listUsers(workspaceRef: string | undefined, options: UsersOptions): Promise<void> {
    if (workspaceRef && options.workspace) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot specify workspace both as argument and --workspace flag',
        )
    }

    let workspaceId: number
    const ref = workspaceRef || options.workspace

    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    let users = await getWorkspaceUsers(workspaceId)

    if (options.search) {
        const search = options.search.toLowerCase()
        users = users.filter(
            (u) => u.name.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search),
        )
    }

    if (options.json) {
        console.log(formatJson(users, 'user', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson(users, 'user', options.full))
        return
    }

    if (users.length === 0) {
        console.log('No users found.')
        return
    }

    for (const u of users) {
        const id = colors.timestamp(`id:${u.id}`)
        const name = u.name
        const email = u.email ? colors.timestamp(`<${u.email}>`) : ''
        const type = colors.channel(`[${u.userType}]`)
        const bot = u.bot ? chalk.yellow(' [bot]') : ''
        console.log(`${id}  ${name} ${email} ${type}${bot}`)
    }
}

export function registerUserCommand(program: Command): void {
    program
        .command('user')
        .description('Show current user info')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw user
  tw user --json`,
        )
        .action(showCurrentUser)

    program
        .command('users [workspace-ref]')
        .description('List users in a workspace')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--search <text>', 'Filter by name/email')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw users
  tw users --search "Jane" --json`,
        )
        .action(listUsers)
}
