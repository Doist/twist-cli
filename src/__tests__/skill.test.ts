import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk', () => ({
    default: {
        green: vi.fn((text) => text),
        bold: vi.fn((text) => text),
        dim: vi.fn((text) => text),
    },
}))

import { registerSkillCommand } from '../commands/skill.js'
import { SKILL_FILE_CONTENT } from '../lib/skills/content.js'
import { createInstaller } from '../lib/skills/create-installer.js'
import { getInstaller, listAgentNames, listAgents, skillInstallers } from '../lib/skills/index.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerSkillCommand(program)
    return program
}

describe('skill registry', () => {
    it('returns claude-code installer', () => {
        const installer = getInstaller('claude-code')
        expect(installer).not.toBeNull()
        expect(installer?.name).toBe('claude-code')
    })

    it('returns codex installer', () => {
        const installer = getInstaller('codex')
        expect(installer).not.toBeNull()
        expect(installer?.name).toBe('codex')
    })

    it('returns cursor installer', () => {
        const installer = getInstaller('cursor')
        expect(installer).not.toBeNull()
        expect(installer?.name).toBe('cursor')
    })

    it('returns null for unknown agent', () => {
        const installer = getInstaller('unknown-agent')
        expect(installer).toBeNull()
    })

    it('lists all available agents', () => {
        const names = listAgentNames()
        expect(names).toContain('claude-code')
        expect(names).toContain('codex')
        expect(names).toContain('cursor')
    })
})

describe('installer paths', () => {
    const cases = [
        { agent: 'claude-code', dir: '.claude', desc: 'Claude Code skill for Twist CLI' },
        { agent: 'codex', dir: '.codex', desc: 'Codex skill for Twist CLI' },
        { agent: 'cursor', dir: '.cursor', desc: 'Cursor skill for Twist CLI' },
    ] as const

    for (const { agent, dir, desc } of cases) {
        describe(agent, () => {
            const installer = skillInstallers[agent]

            it('has correct name and description', () => {
                expect(installer.name).toBe(agent)
                expect(installer.description).toBe(desc)
            })

            it(`returns global path containing ${dir}/skills`, () => {
                const globalPath = installer.getInstallPath({ local: false })
                expect(globalPath).toContain(dir)
                expect(globalPath).toContain('skills')
                expect(globalPath).toContain('twist-cli')
                expect(globalPath).toContain('SKILL.md')
            })

            it('returns local path containing cwd', () => {
                const localPath = installer.getInstallPath({ local: true })
                expect(localPath).toContain(dir)
                expect(localPath).toContain('skills')
                expect(localPath).toContain('twist-cli')
                expect(localPath).toContain('SKILL.md')
                expect(localPath).toContain(process.cwd())
            })
        })
    }
})

describe('installer operations', () => {
    let testDir: string
    const originalCwd = process.cwd()

    beforeEach(async () => {
        testDir = join(tmpdir(), `twist-cli-test-${Date.now()}`)
        await mkdir(testDir, { recursive: true })
        process.chdir(testDir)
    })

    afterEach(async () => {
        process.chdir(originalCwd)
        await rm(testDir, { recursive: true, force: true })
    })

    it('installs and reads skill content', async () => {
        const installer = skillInstallers['claude-code']
        await installer.install({ local: true })

        const skillPath = installer.getInstallPath({ local: true })
        const content = await readFile(skillPath, 'utf-8')
        expect(content).toBe(SKILL_FILE_CONTENT)
    })

    it('reports not installed initially', async () => {
        const installer = skillInstallers.codex
        const installed = await installer.isInstalled({ local: true })
        expect(installed).toBe(false)
    })

    it('throws when installing without force if exists', async () => {
        const installer = skillInstallers.cursor
        await installer.install({ local: true })
        await expect(installer.install({ local: true })).rejects.toThrow(
            /already installed.*Use --force/,
        )
    })

    it('allows force install over existing', async () => {
        const installer = skillInstallers['claude-code']
        await installer.install({ local: true })
        await expect(installer.install({ local: true, force: true })).resolves.not.toThrow()
    })

    it('uninstalls skill', async () => {
        const installer = skillInstallers.codex
        await installer.install({ local: true })
        await installer.uninstall({ local: true })
        const installed = await installer.isInstalled({ local: true })
        expect(installed).toBe(false)
    })

    it('throws when uninstalling non-existent skill', async () => {
        const installer = skillInstallers.cursor
        await expect(installer.uninstall({ local: true })).rejects.toThrow(/not installed/)
    })
})

describe('listAgents', () => {
    let testDir: string
    const originalCwd = process.cwd()

    beforeEach(async () => {
        testDir = join(tmpdir(), `twist-cli-test-${Date.now()}`)
        await mkdir(testDir, { recursive: true })
        process.chdir(testDir)
    })

    afterEach(async () => {
        process.chdir(originalCwd)
        await rm(testDir, { recursive: true, force: true })
    })

    it('returns agent info with installed status', async () => {
        const agents = await listAgents(true)
        expect(agents.length).toBe(3)

        for (const name of ['claude-code', 'codex', 'cursor']) {
            const agent = agents.find((a) => a.name === name)
            expect(agent).toBeDefined()
            expect(agent?.installed).toBe(false)
            expect(agent?.path).toBeNull()
        }
    })

    it('shows installed path when installed', async () => {
        const installer = skillInstallers['claude-code']
        await installer.install({ local: true })

        const agents = await listAgents(true)
        const claudeCode = agents.find((a) => a.name === 'claude-code')
        expect(claudeCode?.installed).toBe(true)
        expect(claudeCode?.path).toContain('SKILL.md')
    })
})

describe('skill command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>
    let testDir: string
    const originalCwd = process.cwd()

    beforeEach(async () => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        testDir = join(tmpdir(), `twist-cli-test-${Date.now()}`)
        await mkdir(testDir, { recursive: true })
        process.chdir(testDir)
    })

    afterEach(async () => {
        consoleSpy.mockRestore()
        consoleErrorSpy.mockRestore()
        process.chdir(originalCwd)
        await rm(testDir, { recursive: true, force: true })
    })

    it('lists agents', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'skill', 'list', '--local'])
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Available agents'))
    })

    it('installs agent locally', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'skill', 'install', 'claude-code', '--local'])
        expect(consoleSpy).toHaveBeenCalledWith('✓', expect.stringContaining('Installed'))

        const skillPath = join(testDir, '.claude', 'skills', 'twist-cli', 'SKILL.md')
        const stats = await stat(skillPath)
        expect(stats.isFile()).toBe(true)
        const content = await readFile(skillPath, 'utf-8')
        expect(content).toBe(SKILL_FILE_CONTENT)
    })

    it('installs codex agent locally', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'skill', 'install', 'codex', '--local'])
        expect(consoleSpy).toHaveBeenCalledWith('✓', expect.stringContaining('Installed'))

        const skillPath = join(testDir, '.codex', 'skills', 'twist-cli', 'SKILL.md')
        const stats = await stat(skillPath)
        expect(stats.isFile()).toBe(true)
    })

    it('installs cursor agent locally', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'skill', 'install', 'cursor', '--local'])
        expect(consoleSpy).toHaveBeenCalledWith('✓', expect.stringContaining('Installed'))

        const skillPath = join(testDir, '.cursor', 'skills', 'twist-cli', 'SKILL.md')
        const stats = await stat(skillPath)
        expect(stats.isFile()).toBe(true)
    })

    it('uninstalls agent', async () => {
        const installer = skillInstallers['claude-code']
        await installer.install({ local: true })

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'skill', 'uninstall', 'claude-code', '--local'])
        expect(consoleSpy).toHaveBeenCalledWith('✓', expect.stringContaining('Uninstalled'))
    })

    it('errors on unknown agent', async () => {
        const program = createProgram()
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit')
        })

        await expect(
            program.parseAsync(['node', 'tw', 'skill', 'install', 'unknown-agent', '--local']),
        ).rejects.toThrow()

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown agent'))
        exitSpy.mockRestore()
    })
})

describe('install detection', () => {
    it('throws when agent directory does not exist', async () => {
        const installer = createInstaller({
            name: 'fake-agent',
            description: 'Fake agent',
            dirName: '.nonexistent-agent-dir-xyz',
        })

        await expect(installer.install({ local: false })).rejects.toThrow(
            'fake-agent does not appear to be installed',
        )
    })
})
