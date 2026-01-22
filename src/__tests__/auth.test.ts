import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth module
vi.mock('../lib/auth.js', () => ({
    saveApiToken: vi.fn(),
    clearApiToken: vi.fn(),
}))

// Mock the api module
vi.mock('../lib/api.js', () => ({
    getSessionUser: vi.fn(),
}))

// Mock the config module
vi.mock('../lib/config.js', () => ({
    getConfigPath: vi.fn(() => '/home/user/.config/twist-cli/config.json'),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk', () => ({
    default: {
        green: vi.fn((text) => text),
        yellow: vi.fn((text) => text),
        dim: vi.fn((text) => text),
    },
}))

import { type User } from '@doist/twist-sdk'
import { registerAuthCommand } from '../commands/auth.js'
import { getSessionUser } from '../lib/api.js'
import { clearApiToken, saveApiToken } from '../lib/auth.js'
import { getConfigPath } from '../lib/config.js'

const mockSaveApiToken = vi.mocked(saveApiToken)
const mockClearApiToken = vi.mocked(clearApiToken)
const mockGetSessionUser = vi.mocked(getSessionUser)
const _mockGetConfigPath = vi.mocked(getConfigPath)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAuthCommand(program)
    return program
}

describe('auth command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()

        // Mock console.log to capture output
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    describe('token subcommand', () => {
        it('successfully saves a token', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            // Mock successful token save
            mockSaveApiToken.mockResolvedValue(undefined)

            await program.parseAsync(['node', 'tw', 'auth', 'token', token])

            // Verify token was saved
            expect(mockSaveApiToken).toHaveBeenCalledWith(token)

            // Verify success message
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'API token saved successfully!')
            expect(consoleSpy).toHaveBeenCalledWith(
                'Token saved to /home/user/.config/twist-cli/config.json',
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

            expect(mockSaveApiToken).toHaveBeenCalledWith(token)
        })

        it('trims whitespace from token', async () => {
            const program = createProgram()
            const tokenWithWhitespace = '  some_token_123456789  '
            const expectedToken = 'some_token_123456789'

            mockSaveApiToken.mockResolvedValue(undefined)

            await program.parseAsync(['node', 'tw', 'auth', 'token', tokenWithWhitespace])

            expect(mockSaveApiToken).toHaveBeenCalledWith(expectedToken)
        })
    })

    describe('status subcommand', () => {
        it('shows authenticated status when logged in', async () => {
            const program = createProgram()

            const mockUser: User = {
                id: 1,
                name: 'Test User',
                shortName: 'test',
                bot: false,
                timezone: 'UTC',
                removed: false,
                email: 'test@example.com',
                lang: 'en',
            }

            mockGetSessionUser.mockResolvedValue(mockUser)

            await program.parseAsync(['node', 'tw', 'auth', 'status'])

            expect(mockGetSessionUser).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Authenticated')
            expect(consoleSpy).toHaveBeenCalledWith('  Email: test@example.com')
            expect(consoleSpy).toHaveBeenCalledWith('  Name:  Test User')
        })

        it('shows not authenticated when no token', async () => {
            const program = createProgram()
            mockGetSessionUser.mockRejectedValue(new Error('No API token found'))

            await program.parseAsync(['node', 'tw', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('Not authenticated')
            expect(consoleSpy).toHaveBeenCalledWith('Run `tw auth token <token>` to authenticate')
        })
    })

    describe('logout subcommand', () => {
        it('clears the API token', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue(undefined)

            await program.parseAsync(['node', 'tw', 'auth', 'logout'])

            expect(mockClearApiToken).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Logged out')
            expect(consoleSpy).toHaveBeenCalledWith(
                'Token removed from /home/user/.config/twist-cli/config.json',
            )
        })
    })
})
