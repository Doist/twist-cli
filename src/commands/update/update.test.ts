import type { ChildProcess } from 'node:child_process'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
    spawn: vi.fn(),
}))

vi.mock('chalk')

vi.mock('../../lib/spinner.js', () => ({
    withSpinner: vi.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
}))

vi.mock('../../lib/config.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../lib/config.js')>()
    return {
        ...original,
        readConfig: vi.fn().mockResolvedValue({}),
        writeConfig: vi.fn().mockResolvedValue(undefined),
    }
})

import { spawn } from 'node:child_process'
import pkg from '../../../package.json' with { type: 'json' }
import { readConfig, writeConfig } from '../../lib/config.js'
import { registerUpdateCommand } from './index.js'

const mockSpawn = vi.mocked(spawn)
const mockReadConfig = vi.mocked(readConfig)
const mockWriteConfig = vi.mocked(writeConfig)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerUpdateCommand(program)
    return program
}

function mockFetch(version: string) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ version }),
        }),
    )
}

function mockFetchError(status: number) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: false,
            status,
        }),
    )
}

function mockFetchNetworkError(code: string) {
    const error = new Error(`getaddrinfo ENOTFOUND registry.npmjs.org`)
    ;(error as NodeJS.ErrnoException).code = code
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
}

function mockSpawnSuccess() {
    mockSpawn.mockImplementation(() => {
        const child = {
            stderr: {
                on: vi.fn(),
            },
            on: vi.fn((event: string, cb: (arg: unknown) => void) => {
                if (event === 'close') {
                    setTimeout(() => cb(0), 0)
                }
                return child
            }),
        }
        return child as unknown as ChildProcess
    })
}

function mockSpawnFailure(exitCode: number) {
    mockSpawn.mockImplementation(() => {
        const child = {
            stderr: {
                on: vi.fn(),
            },
            on: vi.fn((event: string, cb: (arg: unknown) => void) => {
                if (event === 'close') {
                    setTimeout(() => cb(exitCode), 0)
                }
                return child
            }),
        }
        return child as unknown as ChildProcess
    })
}

function mockSpawnPermissionError() {
    mockSpawn.mockImplementation(() => {
        const child = {
            stderr: {
                on: vi.fn(),
            },
            on: vi.fn((event: string, cb: (arg: unknown) => void) => {
                if (event === 'error') {
                    const error = new Error('EACCES') as NodeJS.ErrnoException
                    error.code = 'EACCES'
                    setTimeout(() => cb(error), 0)
                }
                return child
            }),
        }
        return child as unknown as ChildProcess
    })
}

describe('update command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockReadConfig.mockResolvedValue({})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        consoleErrorSpy.mockRestore()
        vi.unstubAllGlobals()
    })

    describe('already up to date', () => {
        it('shows already up to date when versions match', async () => {
            mockFetch(pkg.version)

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleSpy).toHaveBeenCalledWith('✓', `Already up to date (v${pkg.version})`)
            expect(mockSpawn).not.toHaveBeenCalled()
        })
    })

    describe('--check flag', () => {
        it('shows update available without installing', async () => {
            mockFetch('99.0.0')

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(`Update available:`))
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel:'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('shows already up to date with --check when versions match', async () => {
            mockFetch(pkg.version)

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith('✓', `Already up to date (v${pkg.version})`)
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel:'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('shows channel info with --check', async () => {
            mockFetch('99.0.0')

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel:'))
        })

        it('shows pre-release channel with --check when configured', async () => {
            mockReadConfig.mockResolvedValue({ updateChannel: 'pre-release' })
            mockFetch('99.0.0-rc.1')

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel:'))
        })

        it('falls back to stable when the configured channel is invalid', async () => {
            mockReadConfig.mockResolvedValue({ updateChannel: 'beta' as never })
            mockFetch(pkg.version)

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel: stable'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })
    })

    describe('update available', () => {
        it('spawns npm install and reports success', async () => {
            mockFetch('99.0.0')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(mockSpawn).toHaveBeenCalledWith(
                'npm',
                ['install', '-g', '@doist/twist-cli@latest'],
                { stdio: 'pipe' },
            )
            expect(consoleSpy).toHaveBeenCalledWith(`Update available: v${pkg.version} → v99.0.0`)
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Updated to v99.0.0')
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('tw changelog'),
                expect.anything(),
            )
        })

        it('uses pnpm add when pnpm is detected', async () => {
            mockFetch('99.0.0')
            mockSpawnSuccess()
            vi.stubEnv('npm_execpath', '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs')

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(mockSpawn).toHaveBeenCalledWith(
                'pnpm',
                ['add', '-g', '@doist/twist-cli@latest'],
                { stdio: 'pipe' },
            )
        })
    })

    describe('registry errors', () => {
        it('handles HTTP errors from registry', async () => {
            mockFetchError(503)

            const program = createProgram()
            await expect(program.parseAsync(['node', 'tw', 'update'])).rejects.toHaveProperty(
                'code',
                'API_ERROR',
            )
        })

        it('handles network failures', async () => {
            mockFetchNetworkError('ENOTFOUND')

            const program = createProgram()
            await expect(program.parseAsync(['node', 'tw', 'update'])).rejects.toHaveProperty(
                'code',
                'API_ERROR',
            )
        })
    })

    describe('install errors', () => {
        it('handles EACCES permission error and suggests sudo', async () => {
            mockFetch('99.0.0')
            mockSpawnPermissionError()

            const program = createProgram()
            await expect(program.parseAsync(['node', 'tw', 'update'])).rejects.toHaveProperty(
                'code',
                'INTERNAL_ERROR',
            )
        })

        it('handles non-zero exit code from npm', async () => {
            mockFetch('99.0.0')
            mockSpawnFailure(1)

            const program = createProgram()
            await expect(program.parseAsync(['node', 'tw', 'update'])).rejects.toHaveProperty(
                'code',
                'INTERNAL_ERROR',
            )
        })
    })

    describe('pre-release channel', () => {
        beforeEach(() => {
            mockReadConfig.mockResolvedValue({ updateChannel: 'pre-release' })
        })

        it('fetches from /next when on pre-release channel', async () => {
            mockFetch('99.0.0-rc.1')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(global.fetch).toHaveBeenCalledWith(
                'https://registry.npmjs.org/@doist/twist-cli/next',
            )
        })

        it('installs with @next tag', async () => {
            mockFetch('99.0.0-rc.1')
            mockSpawnSuccess()
            vi.stubEnv('npm_execpath', '')

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(mockSpawn).toHaveBeenCalledWith(
                'npm',
                ['install', '-g', '@doist/twist-cli@next'],
                { stdio: 'pipe' },
            )
        })

        it('does not show changelog hint on pre-release', async () => {
            mockFetch('99.0.0-rc.1')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleSpy).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('tw changelog'),
                expect.anything(),
            )
        })

        it('treats next.10 as newer than next.2 (multi-digit prerelease)', async () => {
            mockFetch('99.0.0-next.10')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'))
            expect(mockSpawn).toHaveBeenCalled()
        })

        it('warns on downgrade but still installs', async () => {
            mockFetch('0.0.1')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Downgrade available'))
            expect(mockSpawn).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Updated to v0.0.1')
        })
    })

    describe('switch subcommand', () => {
        it('switches to stable', async () => {
            mockReadConfig.mockResolvedValue({ updateChannel: 'pre-release' })

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', 'switch', '--stable'])

            expect(mockWriteConfig).toHaveBeenCalledWith(
                expect.objectContaining({ updateChannel: 'stable' }),
            )
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Update channel set to stable')
        })

        it('switches to pre-release with warning', async () => {
            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', 'switch', '--pre-release'])

            expect(mockWriteConfig).toHaveBeenCalledWith(
                expect.objectContaining({ updateChannel: 'pre-release' }),
            )
            expect(consoleSpy).toHaveBeenCalledWith('✓', expect.stringContaining('pre-release'))
            expect(consoleSpy).toHaveBeenCalledWith(
                'Note:',
                expect.anything(),
                expect.anything(),
                expect.anything(),
            )
        })

        it('errors when both flags specified', async () => {
            const program = createProgram()
            await expect(
                program.parseAsync(['node', 'tw', 'update', 'switch', '--stable', '--pre-release']),
            ).rejects.toHaveProperty('code', 'CONFLICTING_OPTIONS')

            expect(mockWriteConfig).not.toHaveBeenCalled()
        })

        it('errors when no flags specified', async () => {
            const program = createProgram()
            await expect(
                program.parseAsync(['node', 'tw', 'update', 'switch']),
            ).rejects.toHaveProperty('code', 'CONFLICTING_OPTIONS')

            expect(mockWriteConfig).not.toHaveBeenCalled()
        })

        it('preserves existing config fields', async () => {
            mockReadConfig.mockResolvedValue({
                currentWorkspace: 42,
                updateChannel: 'stable',
            })

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', 'switch', '--pre-release'])

            expect(mockWriteConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    currentWorkspace: 42,
                    updateChannel: 'pre-release',
                }),
            )
        })
    })

    describe('--channel flag', () => {
        it('shows stable by default', async () => {
            mockReadConfig.mockResolvedValue({})

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--channel'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stable'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('shows pre-release when configured', async () => {
            mockReadConfig.mockResolvedValue({ updateChannel: 'pre-release' })

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--channel'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pre-release'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('does not fetch from registry', async () => {
            mockReadConfig.mockResolvedValue({})
            const fetchSpy = vi.spyOn(global, 'fetch')

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--channel'])

            expect(fetchSpy).not.toHaveBeenCalled()
            fetchSpy.mockRestore()
        })

        it('errors when combined with --check', async () => {
            mockReadConfig.mockResolvedValue({})

            const program = createProgram()
            await expect(
                program.parseAsync(['node', 'tw', 'update', '--channel', '--check']),
            ).rejects.toHaveProperty('code', 'CONFLICTING_OPTIONS')

            expect(mockSpawn).not.toHaveBeenCalled()
        })
    })
})
