import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock auth module
vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        upsertAccount: vi.fn(),
        clearApiToken: vi.fn(),
        getAuthMetadata: vi.fn(),
        listStoredAccounts: vi.fn(),
    }
})

// Mock config (status reads it for default-account marker)
vi.mock('../../lib/config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/config.js')>()
    return {
        ...actual,
        getConfig: vi.fn(),
    }
})

// Mock api module — getSessionUser used by status, createWrappedTwistClient used by login/token
vi.mock('../../lib/api.js', () => ({
    getSessionUser: vi.fn(),
    createWrappedTwistClient: vi.fn(),
}))

// Mock OAuth modules
vi.mock('../../lib/oauth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/oauth.js')>()
    return {
        ...actual,
        buildAuthorizationUrl: vi.fn(),
        exchangeCodeForToken: vi.fn(),
        registerDynamicClient: vi.fn(),
    }
})

vi.mock('../../lib/oauth-server.js', () => ({
    startCallbackServer: vi.fn(),
}))

vi.mock('../../lib/pkce.js', () => ({
    generateCodeVerifier: vi.fn(),
    generateCodeChallenge: vi.fn(),
    generateState: vi.fn(),
}))

vi.mock('open', () => ({
    default: vi.fn(),
}))

vi.mock('node:readline', () => ({
    createInterface: vi.fn(() => {
        const rl = {
            question: vi.fn(),
            close: vi.fn(),
        }
        return rl
    }),
}))

vi.mock('chalk')

import { createInterface, type Interface } from 'node:readline'
import { type User } from '@doist/twist-sdk'
import open from 'open'
import { createWrappedTwistClient, getSessionUser } from '../../lib/api.js'
import {
    clearApiToken,
    getAuthMetadata,
    listStoredAccounts,
    upsertAccount,
} from '../../lib/auth.js'
import { getConfig } from '../../lib/config.js'
import { startCallbackServer } from '../../lib/oauth-server.js'
import {
    buildAuthorizationUrl,
    exchangeCodeForToken,
    registerDynamicClient,
} from '../../lib/oauth.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../../lib/pkce.js'
import { registerAuthCommand } from './index.js'

const mockCreateInterface = vi.mocked(createInterface)
const mockUpsertAccount = vi.mocked(upsertAccount)
const mockClearApiToken = vi.mocked(clearApiToken)
const mockGetAuthMetadata = vi.mocked(getAuthMetadata)
const mockListStoredAccounts = vi.mocked(listStoredAccounts)
const mockGetConfig = vi.mocked(getConfig)
const mockGetSessionUser = vi.mocked(getSessionUser)
const mockCreateWrappedTwistClient = vi.mocked(createWrappedTwistClient)

const mockGenerateCodeVerifier = vi.mocked(generateCodeVerifier)
const mockGenerateCodeChallenge = vi.mocked(generateCodeChallenge)
const mockGenerateState = vi.mocked(generateState)
const mockBuildAuthorizationUrl = vi.mocked(buildAuthorizationUrl)
const mockStartCallbackServer = vi.mocked(startCallbackServer)
const mockExchangeCodeForToken = vi.mocked(exchangeCodeForToken)
const mockRegisterDynamicClient = vi.mocked(registerDynamicClient)
const mockOpen = vi.mocked(open)

const TEST_USER: User = {
    id: 12345,
    name: 'Scott',
    shortName: 'scott',
    bot: false,
    timezone: 'UTC',
    removed: false,
    email: 'scott@example.com',
    lang: 'en',
}

function stubProbeApiForUser(user: User = TEST_USER) {
    mockCreateWrappedTwistClient.mockReturnValue({
        users: { getSessionUser: vi.fn().mockResolvedValue(user) },
        // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface
    } as any)
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAuthCommand(program)
    return program
}

describe('auth command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockListStoredAccounts.mockResolvedValue([])
        mockGetConfig.mockResolvedValue({})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
    })

    describe('token subcommand', () => {
        it('saves a token after looking up the user', async () => {
            const program = createProgram()
            stubProbeApiForUser()
            mockUpsertAccount.mockResolvedValue({ storage: 'secure-store', replaced: false })

            await program.parseAsync(['node', 'tw', 'auth', 'token', 'some_token_123456789'])

            expect(mockCreateWrappedTwistClient).toHaveBeenCalledWith('some_token_123456789')
            expect(mockUpsertAccount).toHaveBeenCalledWith({
                id: '12345',
                email: 'scott@example.com',
                name: 'Scott',
                token: 'some_token_123456789',
                authMode: 'unknown',
            })
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Saved token for scott@example.com')
        })

        it('trims whitespace from token before identifying user', async () => {
            const program = createProgram()
            stubProbeApiForUser()
            mockUpsertAccount.mockResolvedValue({ storage: 'secure-store', replaced: false })

            await program.parseAsync(['node', 'tw', 'auth', 'token', '  some_token_123456789  '])

            expect(mockCreateWrappedTwistClient).toHaveBeenCalledWith('some_token_123456789')
        })

        it('shows "Updated stored token for" when account already existed', async () => {
            const program = createProgram()
            stubProbeApiForUser()
            mockUpsertAccount.mockResolvedValue({ storage: 'secure-store', replaced: true })

            await program.parseAsync(['node', 'tw', 'auth', 'token', 'some_token_123456789'])

            expect(consoleSpy).toHaveBeenCalledWith(
                '✓',
                'Updated stored token for scott@example.com',
            )
        })

        it('prompts interactively when no token argument given', async () => {
            const originalIsTTY = process.stdin.isTTY
            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
            const program = createProgram()
            const mockRl = {
                question: vi.fn((_p: string, cb: (a: string) => void) => cb('interactive_456789')),
                close: vi.fn(),
                _writeToOutput: vi.fn(),
            }
            mockCreateInterface.mockReturnValue(mockRl as unknown as Interface)
            stubProbeApiForUser()
            mockUpsertAccount.mockResolvedValue({ storage: 'secure-store', replaced: false })
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'tw', 'auth', 'token'])

            expect(mockUpsertAccount).toHaveBeenCalledWith(
                expect.objectContaining({ token: 'interactive_456789' }),
            )
            writeSpy.mockRestore()
            Object.defineProperty(process.stdin, 'isTTY', {
                value: originalIsTTY,
                configurable: true,
            })
        })

        it('errors in non-interactive mode with no token argument', async () => {
            const originalIsTTY = process.stdin.isTTY
            Object.defineProperty(process.stdin, 'isTTY', {
                value: undefined,
                configurable: true,
            })
            const program = createProgram()

            await expect(
                program.parseAsync(['node', 'tw', 'auth', 'token']),
            ).rejects.toHaveProperty('code', 'NO_TOKEN')

            expect(mockUpsertAccount).not.toHaveBeenCalled()
            Object.defineProperty(process.stdin, 'isTTY', {
                value: originalIsTTY,
                configurable: true,
            })
        })

        it('surfaces config-file fallback warning', async () => {
            const program = createProgram()
            stubProbeApiForUser()
            mockUpsertAccount.mockResolvedValue({
                storage: 'config-file',
                replaced: false,
                warning: 'system credential manager unavailable; token saved as plaintext in /x',
            })

            await program.parseAsync(['node', 'tw', 'auth', 'token', 'some_token_123456789'])

            expect(errorSpy).toHaveBeenCalledWith(
                'Warning:',
                'system credential manager unavailable; token saved as plaintext in /x',
            )
        })
    })

    describe('login subcommand', () => {
        function setupOAuthMocks(authCode = 'auth_code_123', accessToken = 'access_token_123') {
            mockRegisterDynamicClient.mockResolvedValue({
                client_id: 'twd_dyn',
                client_secret: 'sec',
            })
            mockGenerateCodeVerifier.mockReturnValue('verifier')
            mockGenerateCodeChallenge.mockReturnValue('challenge')
            mockGenerateState.mockReturnValue('state')
            mockBuildAuthorizationUrl.mockReturnValue('https://twist.com/oauth/authorize?…')
            const cleanup = vi.fn()
            mockStartCallbackServer.mockResolvedValue({ code: authCode, cleanup })
            mockExchangeCodeForToken.mockResolvedValue(accessToken)
            mockOpen.mockResolvedValue({} as Awaited<ReturnType<typeof open>>)
            stubProbeApiForUser()
            mockUpsertAccount.mockResolvedValue({ storage: 'secure-store', replaced: false })
            return cleanup
        }

        it('completes OAuth flow and upserts the account', async () => {
            const program = createProgram()
            const cleanup = setupOAuthMocks()

            await program.parseAsync(['node', 'tw', 'auth', 'login'])

            expect(mockExchangeCodeForToken).toHaveBeenCalled()
            expect(mockCreateWrappedTwistClient).toHaveBeenCalledWith('access_token_123')
            expect(mockUpsertAccount).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: '12345',
                    email: 'scott@example.com',
                    token: 'access_token_123',
                    authMode: 'read-write',
                }),
            )
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Logged in as scott@example.com')
            expect(cleanup).toHaveBeenCalled()
        })

        it('uses read-only mode when --read-only is set', async () => {
            const program = createProgram()
            setupOAuthMocks()

            await program.parseAsync(['node', 'tw', 'auth', 'login', '--read-only'])

            expect(mockUpsertAccount).toHaveBeenCalledWith(
                expect.objectContaining({ authMode: 'read-only' }),
            )
        })

        it('shows "Updated credentials for" when re-logging in', async () => {
            const program = createProgram()
            setupOAuthMocks()
            mockUpsertAccount.mockResolvedValue({ storage: 'secure-store', replaced: true })

            await program.parseAsync(['node', 'tw', 'auth', 'login'])

            expect(consoleSpy).toHaveBeenCalledWith(
                '✓',
                'Updated credentials for scott@example.com',
            )
        })

        it('cleanup runs on callback server error', async () => {
            const program = createProgram()
            mockRegisterDynamicClient.mockResolvedValue({
                client_id: 'twd_dyn',
                client_secret: 'sec',
            })
            mockGenerateCodeVerifier.mockReturnValue('verifier')
            mockGenerateCodeChallenge.mockReturnValue('challenge')
            mockGenerateState.mockReturnValue('state')
            mockStartCallbackServer.mockRejectedValue(new Error('port in use'))

            await expect(
                program.parseAsync(['node', 'tw', 'auth', 'login']),
            ).rejects.toHaveProperty('code', 'AUTH_FAILED')
            expect(mockUpsertAccount).not.toHaveBeenCalled()
        })
    })

    describe('status subcommand', () => {
        it('shows authenticated status when logged in', async () => {
            const program = createProgram()
            mockGetSessionUser.mockResolvedValue(TEST_USER)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })

            await program.parseAsync(['node', 'tw', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Authenticated')
            expect(consoleSpy).toHaveBeenCalledWith('  Email: scott@example.com')
            expect(consoleSpy).toHaveBeenCalledWith('  Mode:  read-write')
        })

        it('marks the active account as default when matching', async () => {
            const program = createProgram()
            mockGetSessionUser.mockResolvedValue(TEST_USER)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockGetConfig.mockResolvedValue({ account: { defaultAccount: '12345' } })

            await program.parseAsync(['node', 'tw', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Authenticated (default)')
        })

        it('lists other stored accounts', async () => {
            const program = createProgram()
            mockGetSessionUser.mockResolvedValue(TEST_USER)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockListStoredAccounts.mockResolvedValue([
                { id: '12345', email: 'scott@example.com' },
                { id: '67890', email: 'other@example.com' },
            ])

            await program.parseAsync(['node', 'tw', 'auth', 'status'])

            const lines = consoleSpy.mock.calls.flat().join('\n')
            expect(lines).toContain('Other stored accounts (1)')
            expect(lines).toContain('other@example.com')
        })

        it('outputs JSON when --json flag is used', async () => {
            const program = createProgram()
            mockGetSessionUser.mockResolvedValue(TEST_USER)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockListStoredAccounts.mockResolvedValue([{ id: '12345', email: 'scott@example.com' }])
            mockGetConfig.mockResolvedValue({ account: { defaultAccount: '12345' } })

            await program.parseAsync(['node', 'tw', 'auth', 'status', '--json'])

            const printed = consoleSpy.mock.calls[0][0] as string
            const parsed = JSON.parse(printed)
            expect(parsed).toMatchObject({
                id: 12345,
                email: 'scott@example.com',
                authMode: 'read-write',
                isDefault: true,
            })
        })

        it('rejects when no token', async () => {
            const program = createProgram()
            mockGetSessionUser.mockRejectedValue(new Error('No API token found'))

            await expect(program.parseAsync(['node', 'tw', 'auth', 'status'])).rejects.toThrow(
                'No API token found',
            )
        })
    })

    describe('logout subcommand', () => {
        it('clears the API token', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue({ storage: 'secure-store' })

            await program.parseAsync(['node', 'tw', 'auth', 'logout'])

            expect(mockClearApiToken).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Logged out')
        })
    })
})
