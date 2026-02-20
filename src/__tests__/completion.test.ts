import { Command, Option } from 'commander'
import { describe, expect, it } from 'vitest'
import {
    type CompletionItem,
    getCompletions,
    parseCompLine,
    withCaseInsensitiveChoices,
    withUnvalidatedChoices,
} from '../lib/completion.js'

function createTestProgram(): Command {
    const program = new Command()
    program.name('tw')

    const thread = program.command('thread').description('Thread operations')
    thread.command('view').description('View thread').option('--json', 'Output as JSON')
    thread
        .command('reply')
        .description('Reply in thread')
        .addOption(
            withUnvalidatedChoices(new Option('--notify <recipients>', 'Notification targets'), [
                'EVERYONE',
                'EVERYONE_IN_THREAD',
            ]),
        )

    program
        .command('search')
        .description('Search content')
        .addOption(
            withCaseInsensitiveChoices(new Option('--type <type>', 'Search type'), [
                'threads',
                'messages',
                'all',
            ]),
        )
        .option('--json', 'Output as JSON')

    // Hidden command (like completion-server)
    program.command('hidden-cmd', { hidden: true }).description('Internal command')

    return program
}

function names(items: CompletionItem[]): string[] {
    return items.map((i) => i.name)
}

describe('getCompletions', () => {
    it('returns visible top-level commands', () => {
        const program = createTestProgram()
        const result = getCompletions(program, [''], '')
        expect(names(result)).toContain('thread')
        expect(names(result)).toContain('search')
        expect(names(result)).not.toContain('hidden-cmd')
    })

    it('returns subcommands inside a command', () => {
        const program = createTestProgram()
        const result = getCompletions(program, ['thread', ''], '')
        const resultNames = names(result)
        expect(resultNames).toContain('view')
        expect(resultNames).toContain('reply')
    })

    it('returns options when current word starts with -', () => {
        const program = createTestProgram()
        const result = getCompletions(program, ['search', '--'], '--')
        const resultNames = names(result)
        expect(resultNames).toContain('--type')
        expect(resultNames).toContain('--json')
    })

    it('suggests option values from argChoices', () => {
        const program = createTestProgram()
        const result = getCompletions(program, ['search', '--type', ''], '')
        expect(names(result)).toEqual(['threads', 'messages', 'all'])
    })

    it('supports --flag=value completion', () => {
        const program = createTestProgram()
        const result = getCompletions(program, ['search', '--type='], '--type=')
        expect(names(result)).toEqual(['--type=threads', '--type=messages', '--type=all'])
    })

    it('supports unvalidated choices for options with extra accepted formats', () => {
        const program = createTestProgram()
        const result = getCompletions(program, ['thread', 'reply', '--notify', ''], '')
        expect(names(result)).toEqual(['EVERYONE', 'EVERYONE_IN_THREAD'])
    })

    it('stops offering options after --', () => {
        const program = createTestProgram()
        const result = getCompletions(program, ['search', '--', '--ty'], '--ty')
        expect(result).toEqual([])
    })
})

describe('parseCompLine quoted argument limitation', () => {
    it('splits quoted multi-word arguments into separate tokens', () => {
        const result = parseCompLine('tw thread reply "hello world"')
        expect(result).toEqual(['thread', 'reply', '"hello', 'world"'])
    })

    it('strips completion-server token', () => {
        const result = parseCompLine('tw completion-server thread rep')
        expect(result).toEqual(['thread', 'rep'])
    })
})

// These tests verify assumptions we make about Commander internals.
describe('Commander internal assumptions', () => {
    it('choices() sets parseArg on the option', () => {
        const opt = new Option('--color <c>', 'Pick a color')
        expect(opt.parseArg).toBeUndefined()

        opt.choices(['red', 'blue'])
        expect(opt.parseArg).toBeTypeOf('function')
    })

    it('argChoices set directly is readable by option consumers', () => {
        const opt = new Option('--role <r>', 'Role')
        opt.argChoices = ['ADMIN', 'MEMBER']
        expect(opt.argChoices).toEqual(['ADMIN', 'MEMBER'])
    })

    it('{ hidden: true } sets _hidden on the command', () => {
        const program = new Command()
        const visible = program.command('visible')
        const hidden = program.command('secret', { hidden: true })

        expect((visible as Command & { _hidden: boolean })._hidden).toBe(false)
        expect((hidden as Command & { _hidden: boolean })._hidden).toBe(true)
    })
})
