import chalk from 'chalk'
import { Command } from 'commander'
import { getCurrentWorkspaceId, getSessionUser, getWorkspaceUsers } from '../lib/api.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

interface UsersOptions {
    workspace?: string
    search?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

async function showCurrentUser(): Promise<void> {
    const user = await getSessionUser()

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
    let workspaceId: number

    if (workspaceRef) {
        const workspace = await resolveWorkspaceRef(workspaceRef)
        workspaceId = workspace.id
    } else if (options.workspace) {
        const workspace = await resolveWorkspaceRef(options.workspace)
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

    if (users.length === 0) {
        console.log('No users found.')
        return
    }

    if (options.json) {
        console.log(formatJson(users, 'user', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson(users, 'user', options.full))
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
    program.command('user').description('Show current user info').action(showCurrentUser)

    program
        .command('users [workspace-ref]')
        .description('List users in a workspace')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--search <text>', 'Filter by name/email')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listUsers)
}
