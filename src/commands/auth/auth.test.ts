import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth module
vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        saveApiToken: vi.fn(),
        clearApiToken: vi.fn(),
        getAuthMetadata: vi.fn(),
    }
})

// Mock the api module
vi.mock('../../lib/api.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/api.js')>()
    return {
        ...actual,
        getSessionUser: vi.fn(),
        createWrappedTwistClient: vi.fn(),
    }
})

// Mock cli-core's auth subpath so login subcommand wiring doesn't drive a real
// OAuth flow during tests. The provider + token-store units are exercised in
// src/lib/auth-provider.test.ts. attachLogoutCommand + attachStatusCommand
// fall through to the real cli-core implementations so the integration is
// exercised end-to-end.
vi.mock('@doist/cli-core/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
    return {
        ...actual,
        attachLoginCommand: vi.fn((parent, _options) => {
            const cmd = parent.command('login')
            cmd.action(() => {})
            return cmd
        }),
    }
})

// Mock readline for interactive token input
vi.mock('node:readline', () => ({
    createInterface: vi.fn(() => {
        const rl = {
            question: vi.fn(),
            close: vi.fn(),
        }
        return rl
    }),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk')

import { createInterface, type Interface } from 'node:readline'
import { attachLoginCommand } from '@doist/cli-core/auth'
import { type User } from '@doist/twist-sdk'
import { createWrappedTwistClient, getSessionUser } from '../../lib/api.js'
import { type TwistAccount, type TwistTokenStore } from '../../lib/auth-provider.js'
import { clearApiToken, getAuthMetadata, saveApiToken } from '../../lib/auth.js'
import { registerAuthCommand } from './index.js'
import { attachTwistStatusCommand } from './status.js'

const mockCreateInterface = vi.mocked(createInterface)

const mockSaveApiToken = vi.mocked(saveApiToken)
const mockClearApiToken = vi.mocked(clearApiToken)
const mockGetAuthMetadata = vi.mocked(getAuthMetadata)
const mockGetSessionUser = vi.mocked(getSessionUser)
const mockCreateWrappedTwistClient = vi.mocked(createWrappedTwistClient)
const mockAttachLoginCommand = vi.mocked(attachLoginCommand)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAuthCommand(program)
    return program
}

const TEST_USER: User = {
    id: 1,
    name: 'Test User',
    shortName: 'test',
    bot: false,
    timezone: 'UTC',
    removed: false,
    email: 'test@example.com',
    lang: 'en',
}

describe('auth command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()

        // Mock console.log to capture output
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
    })

    describe('token subcommand', () => {
        it('successfully saves a token', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            // Mock successful token save
            mockSaveApiToken.mockResolvedValue({ storage: 'secure-store' })

            await program.parseAsync(['node', 'tw', 'auth', 'token', token])

            // Verify token was saved with unknown auth mode
            expect(mockSaveApiToken).toHaveBeenCalledWith(token, { authMode: 'unknown' })

            // Verify success message
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'API token saved successfully!')
            expect(consoleSpy).toHaveBeenCalledWith(
                'Token stored securely in the system credential manager',
            )
        })

        it('handles saveApiToken errors', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            // Mock save failure
            mockSaveApiToken.mockRejectedValue(new Error('Permission denied'))

            await expect(
                program.parseAsync(['node', 'tw', 'auth', 'token', token]),
            ).rejects.toThrow('Permission denied')

            expect(mockSaveApiToken).toHaveBeenCalledWith(token, { authMode: 'unknown' })
        })

        it('trims whitespace from token', async () => {
            const program = createProgram()
            const tokenWithWhitespace = '  some_token_123456789  '
            const expectedToken = 'some_token_123456789'

            mockSaveApiToken.mockResolvedValue({ storage: 'secure-store' })

            await program.parseAsync(['node', 'tw', 'auth', 'token', tokenWithWhitespace])

            expect(mockSaveApiToken).toHaveBeenCalledWith(expectedToken, { authMode: 'unknown' })
        })

        it('prompts interactively when no token argument given', async () => {
            const originalIsTTY = process.stdin.isTTY
            Object.defineProperty(process.stdin, 'isTTY', {
                value: true,
                configurable: true,
            })
            const program = createProgram()
            const mockRl = {
                question: vi.fn((_prompt: string, cb: (answer: string) => void) => {
                    cb('interactive_token_456')
                }),
                close: vi.fn(),
                _writeToOutput: vi.fn(),
            }
            mockCreateInterface.mockReturnValue(mockRl as unknown as Interface)
            mockSaveApiToken.mockResolvedValue({ storage: 'secure-store' })
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'tw', 'auth', 'token'])

            expect(mockRl.question).toHaveBeenCalled()
            expect(mockRl.close).toHaveBeenCalled()
            expect(mockSaveApiToken).toHaveBeenCalledWith('interactive_token_456', {
                authMode: 'unknown',
            })
            writeSpy.mockRestore()
            Object.defineProperty(process.stdin, 'isTTY', {
                value: originalIsTTY,
                configurable: true,
            })
        })

        it('warns when secure storage falls back to the config file', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            mockSaveApiToken.mockResolvedValue({
                storage: 'config-file',
                warning:
                    'system credential manager unavailable; token saved as plaintext in /home/user/.config/twist-cli/config.json',
            })

            await program.parseAsync(['node', 'tw', 'auth', 'token', token])

            expect(errorSpy).toHaveBeenCalledWith(
                'Warning:',
                'system credential manager unavailable; token saved as plaintext in /home/user/.config/twist-cli/config.json',
            )
        })

        it('warns when secure storage succeeds but plaintext cleanup fails', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            mockSaveApiToken.mockResolvedValue({
                storage: 'secure-store',
                warning:
                    'Token was stored securely, but could not remove legacy plaintext token from /home/user/.config/twist-cli/config.json (EACCES)',
            })

            await program.parseAsync(['node', 'tw', 'auth', 'token', token])

            expect(consoleSpy).toHaveBeenCalledWith(
                'Token stored securely in the system credential manager',
            )
            expect(errorSpy).toHaveBeenCalledWith(
                'Warning:',
                'Token was stored securely, but could not remove legacy plaintext token from /home/user/.config/twist-cli/config.json (EACCES)',
            )
        })

        it('shows error when interactive input is empty', async () => {
            const originalIsTTY = process.stdin.isTTY
            Object.defineProperty(process.stdin, 'isTTY', {
                value: true,
                configurable: true,
            })
            const program = createProgram()
            const mockRl = {
                question: vi.fn((_prompt: string, cb: (answer: string) => void) => {
                    cb('')
                }),
                close: vi.fn(),
                _writeToOutput: vi.fn(),
            }
            mockCreateInterface.mockReturnValue(mockRl as unknown as Interface)
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await expect(
                program.parseAsync(['node', 'tw', 'auth', 'token']),
            ).rejects.toHaveProperty('code', 'NO_TOKEN')

            expect(mockSaveApiToken).not.toHaveBeenCalled()
            writeSpy.mockRestore()
            Object.defineProperty(process.stdin, 'isTTY', {
                value: originalIsTTY,
                configurable: true,
            })
        })

        it('errors in non-interactive mode when no token argument given', async () => {
            const originalIsTTY = process.stdin.isTTY
            Object.defineProperty(process.stdin, 'isTTY', {
                value: undefined,
                configurable: true,
            })
            const program = createProgram()

            await expect(
                program.parseAsync(['node', 'tw', 'auth', 'token']),
            ).rejects.toHaveProperty('code', 'NO_TOKEN')

            expect(mockSaveApiToken).not.toHaveBeenCalled()
            Object.defineProperty(process.stdin, 'isTTY', {
                value: originalIsTTY,
                configurable: true,
            })
        })
    })

    describe('status subcommand', () => {
        it('shows authenticated status when logged in', async () => {
            const program = createProgram()

            mockGetSessionUser.mockResolvedValue(TEST_USER)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'config',
            })

            await program.parseAsync(['node', 'tw', 'auth', 'status'])

            expect(mockGetSessionUser).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓ Authenticated')
            expect(consoleSpy).toHaveBeenCalledWith('  Email: test@example.com')
            expect(consoleSpy).toHaveBeenCalledWith('  Name:  Test User')
            expect(consoleSpy).toHaveBeenCalledWith('  Mode:  read-write')
        })

        it('outputs JSON when --json flag is used', async () => {
            const program = createProgram()

            mockGetSessionUser.mockResolvedValue(TEST_USER)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                authScope: 'user:read threads:read',
                source: 'config',
            })

            await program.parseAsync(['node', 'tw', 'auth', 'status', '--json'])

            const printed = consoleSpy.mock.calls[0][0] as string
            expect(JSON.parse(printed)).toEqual({
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                authMode: 'read-write',
                authScope: 'user:read threads:read',
                source: 'config',
            })
        })

        it('outputs NDJSON when --ndjson flag is used', async () => {
            const program = createProgram()

            mockGetSessionUser.mockResolvedValue(TEST_USER)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'config',
            })

            await program.parseAsync(['node', 'tw', 'auth', 'status', '--ndjson'])

            const printed = consoleSpy.mock.calls[0][0] as string
            expect(JSON.parse(printed)).toEqual({
                id: 1,
                email: 'test@example.com',
                name: 'Test User',
                authMode: 'read-write',
                source: 'config',
            })
        })

        it('throws when not authenticated', async () => {
            const program = createProgram()
            mockGetSessionUser.mockRejectedValue(new Error('No API token found'))

            await expect(program.parseAsync(['node', 'tw', 'auth', 'status'])).rejects.toThrow(
                'No API token found',
            )
        })

        // The default tests above exercise the `onNotAuthenticated` branch (real
        // `store.active()` resolves to null in the test env because no token /
        // identity is persisted). This block drives a controllable snapshot
        // store directly into `attachTwistStatusCommand` so the `fetchLive` →
        // `renderText` / `renderJson` path is also covered.
        describe('persisted-account snapshot path (fetchLive)', () => {
            const SNAPSHOT_ACCOUNT: TwistAccount = {
                id: String(TEST_USER.id),
                label: TEST_USER.name,
                authMode: 'read-write',
                authScope: 'user:read threads:read',
            }

            function programWithSnapshot(): Command {
                const program = new Command()
                program.exitOverride()
                const auth = program.command('auth')
                const snapshotStore: TwistTokenStore = {
                    async active() {
                        return { token: 'snapshot_token', account: SNAPSHOT_ACCOUNT }
                    },
                    async set() {},
                    async clear() {},
                    getLastStorageResult: () => undefined,
                    getLastClearResult: () => undefined,
                }
                attachTwistStatusCommand(auth, snapshotStore)
                return program
            }

            beforeEach(() => {
                mockCreateWrappedTwistClient.mockReturnValue({
                    users: { getSessionUser: vi.fn().mockResolvedValue(TEST_USER) },
                    // biome-ignore lint/suspicious/noExplicitAny: only the methods used in this test matter
                } as any)
                mockGetAuthMetadata.mockResolvedValue({
                    authMode: 'read-write',
                    authScope: 'user:read threads:read',
                    source: 'config',
                })
            })

            it('renders text status from the snapshot', async () => {
                await programWithSnapshot().parseAsync(['node', 'tw', 'auth', 'status'])

                expect(mockCreateWrappedTwistClient).toHaveBeenCalledWith('snapshot_token')
                expect(consoleSpy).toHaveBeenCalledWith('✓ Authenticated')
                expect(consoleSpy).toHaveBeenCalledWith('  Email: test@example.com')
                expect(consoleSpy).toHaveBeenCalledWith('  Name:  Test User')
                expect(consoleSpy).toHaveBeenCalledWith('  Mode:  read-write')
            })

            it('emits the JSON envelope from the snapshot path', async () => {
                await programWithSnapshot().parseAsync(['node', 'tw', 'auth', 'status', '--json'])

                const printed = consoleSpy.mock.calls[0][0] as string
                expect(JSON.parse(printed)).toEqual({
                    id: 1,
                    email: 'test@example.com',
                    name: 'Test User',
                    authMode: 'read-write',
                    authScope: 'user:read threads:read',
                    source: 'config',
                })
            })
        })
    })

    describe('login subcommand wiring', () => {
        it('passes the twist provider, store, port, and renderers to cli-core attachLoginCommand', async () => {
            createProgram()

            expect(mockAttachLoginCommand).toHaveBeenCalledTimes(1)
            const [, options] = mockAttachLoginCommand.mock.calls[0]
            expect(options.preferredPort).toBe(8766)
            expect(typeof options.provider.prepare).toBe('function')
            expect(typeof options.provider.authorize).toBe('function')
            expect(typeof options.provider.exchangeCode).toBe('function')
            expect(typeof options.provider.validateToken).toBe('function')
            expect(typeof options.store.active).toBe('function')
            expect(typeof options.store.set).toBe('function')
            expect(typeof options.store.clear).toBe('function')
            expect(typeof options.renderSuccess).toBe('function')
            expect(typeof options.renderError).toBe('function')
            expect(options.renderSuccess()).toContain("You're connected")
            expect(options.renderError('boom')).toContain('Authentication failed')
        })

        it('resolveScopes returns the read-write scope list by default and read-only when --read-only is set', () => {
            createProgram()

            const [, options] = mockAttachLoginCommand.mock.calls[0]
            const writeScopes = options.resolveScopes({ readOnly: false, flags: {} })
            const readScopes = options.resolveScopes({ readOnly: true, flags: {} })
            expect(writeScopes).toContain('threads:write')
            expect(readScopes).not.toContain('threads:write')
            expect(readScopes).toContain('threads:read')
        })
    })

    describe('logout subcommand', () => {
        const WARNING_RESULT = {
            storage: 'config-file' as const,
            warning:
                'system credential manager unavailable; local auth state cleared in /home/user/.config/twist-cli/config.json',
        }

        it('clears the API token', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue({ storage: 'secure-store' })

            await program.parseAsync(['node', 'tw', 'auth', 'logout'])

            expect(mockClearApiToken).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓ Logged out')
            expect(consoleSpy).toHaveBeenCalledWith(
                'Stored token removed from the system credential manager',
            )
        })

        it('surfaces keyring-fallback warning to stderr in plain mode', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue(WARNING_RESULT)

            await program.parseAsync(['node', 'tw', 'auth', 'logout'])

            expect(consoleSpy).toHaveBeenCalledWith('✓ Logged out')
            expect(errorSpy).toHaveBeenCalledWith('Warning:', WARNING_RESULT.warning)
        })

        it('routes warning to stderr and emits JSON envelope on stdout in --json mode', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue(WARNING_RESULT)

            await program.parseAsync(['node', 'tw', 'auth', 'logout', '--json'])

            const stdoutLines = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0]))
            expect(stdoutLines).toEqual([JSON.stringify({ ok: true }, null, 2)])
            // Plain "Stored token removed" confirmation must be suppressed under --json.
            expect(stdoutLines.join('\n')).not.toContain('Stored token removed')
            expect(errorSpy).toHaveBeenCalledWith('Warning:', WARNING_RESULT.warning)
        })

        it('routes warning to stderr and keeps stdout silent in --ndjson mode', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue(WARNING_RESULT)

            await program.parseAsync(['node', 'tw', 'auth', 'logout', '--ndjson'])

            expect(consoleSpy).not.toHaveBeenCalled()
            expect(errorSpy).toHaveBeenCalledWith('Warning:', WARNING_RESULT.warning)
        })
    })
})
