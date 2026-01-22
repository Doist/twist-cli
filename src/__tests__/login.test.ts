import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth module
vi.mock('../lib/auth.js', () => ({
    saveApiToken: vi.fn(),
}))

// Mock the config module
vi.mock('../lib/config.js', () => ({
    getConfigPath: vi.fn(() => '/home/user/.config/twist-cli/config.json'),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk', () => ({
    default: {
        green: vi.fn((text) => text),
        dim: vi.fn((text) => text),
    },
}))

import { registerLoginCommand } from '../commands/login.js'
import { saveApiToken } from '../lib/auth.js'
import { getConfigPath } from '../lib/config.js'

const mockSaveApiToken = vi.mocked(saveApiToken)
const _mockGetConfigPath = vi.mocked(getConfigPath)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerLoginCommand(program)
    return program
}

describe('login command', () => {
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

            await program.parseAsync(['node', 'tw', 'login', 'token', token])

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
                program.parseAsync(['node', 'tw', 'login', 'token', token]),
            ).rejects.toThrow('Permission denied')

            expect(mockSaveApiToken).toHaveBeenCalledWith(token)
        })

        it('trims whitespace from token', async () => {
            const program = createProgram()
            const tokenWithWhitespace = '  some_token_123456789  '
            const expectedToken = 'some_token_123456789'

            mockSaveApiToken.mockResolvedValue(undefined)

            await program.parseAsync(['node', 'tw', 'login', 'token', tokenWithWhitespace])

            expect(mockSaveApiToken).toHaveBeenCalledWith(expectedToken)
        })

        it('shows help when no arguments provided', async () => {
            const program = createProgram()

            // This should show help for the login command
            await expect(program.parseAsync(['node', 'tw', 'login'])).rejects.toThrow() // Commander throws when required argument is missing

            expect(mockSaveApiToken).not.toHaveBeenCalled()
        })
    })
})
