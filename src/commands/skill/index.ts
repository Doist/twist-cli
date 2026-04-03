import { Command } from 'commander'
import type { UpdateOptions } from '../../lib/skills/types.js'
import { install } from './install.js'
import { list } from './list.js'
import { uninstall } from './uninstall.js'
import { updateSkill } from './update.js'

export function registerSkillCommand(program: Command): void {
    const skill = program.command('skill').description('Manage agent skill integrations')

    skill
        .command('list')
        .description('List available agents and install status')
        .option('--local', 'Check local installation (./.claude/skills/)')
        .action(list)

    skill
        .command('install <agent>')
        .description('Install an agent skill')
        .option('--local', 'Install locally in project (./.claude/skills/)')
        .option('--force', 'Overwrite existing installation')
        .action(install)

    skill
        .command('update [agent]')
        .description('Update an installed agent skill (defaults to all)')
        .option('--local', 'Update local installation')
        .action((agent: string | undefined, options: UpdateOptions) =>
            updateSkill(agent ?? 'all', options),
        )

    skill
        .command('uninstall <agent>')
        .description('Uninstall an agent skill')
        .option('--local', 'Uninstall from local project')
        .action(uninstall)
}
