import type { ChildProcess } from 'node:child_process'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
    spawn: vi.fn(),
}))

vi.mock('chalk')

vi.mock('../lib/spinner.js', () => ({
    withSpinner: vi.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
}))

import { spawn } from 'node:child_process'
import pkg from '../../package.json' with { type: 'json' }
import { registerUpdateCommand } from '../commands/update.js'

const mockSpawn = vi.mocked(spawn)

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

            expect(consoleSpy).toHaveBeenCalledWith(`Update available: v${pkg.version} → v99.0.0`)
            expect(consoleSpy).toHaveBeenCalledWith('Run `tw update` to install')
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('shows already up to date with --check when versions match', async () => {
            mockFetch(pkg.version)

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith('✓', `Already up to date (v${pkg.version})`)
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
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to check for updates:',
                'Registry returned 503',
            )
        })

        it('handles network failures', async () => {
            mockFetchNetworkError('ENOTFOUND')

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to check for updates:',
                expect.stringContaining('ENOTFOUND'),
            )
        })
    })

    describe('install errors', () => {
        it('handles EACCES permission error and suggests sudo', async () => {
            mockFetch('99.0.0')
            mockSpawnPermissionError()

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Permission denied.',
                expect.stringContaining('sudo'),
            )
        })

        it('handles non-zero exit code from npm', async () => {
            mockFetch('99.0.0')
            mockSpawnFailure(1)

            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Update failed:',
                expect.stringContaining('exited with code 1'),
            )
        })
    })
})
