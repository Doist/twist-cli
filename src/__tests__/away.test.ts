import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getSessionUser: vi.fn(),
    getTwistClient: vi.fn(),
    updateUser: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getSessionUser: apiMocks.getSessionUser,
    getTwistClient: apiMocks.getTwistClient,
}))

vi.mock('chalk')

import { registerAwayCommand } from '../commands/away.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAwayCommand(program)
    return program
}

describe('away', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.updateUser.mockResolvedValue({
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
            awayMode: null,
        })
        apiMocks.getTwistClient.mockResolvedValue({
            users: { update: apiMocks.updateUser },
        })
    })

    describe('show', () => {
        it('shows not away when awayMode is null', async () => {
            apiMocks.getSessionUser.mockResolvedValue({
                id: 1,
                name: 'Test User',
                awayMode: null,
            })
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const program = createProgram()

            await program.parseAsync(['node', 'tw', 'away'])

            expect(logSpy).toHaveBeenCalledWith('Not away.')
            logSpy.mockRestore()
        })

        it('shows away status when set', async () => {
            apiMocks.getSessionUser.mockResolvedValue({
                id: 1,
                name: 'Test User',
                awayMode: { type: 'vacation', dateFrom: '2026-03-10', dateTo: '2026-03-20' },
            })
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const program = createProgram()

            await program.parseAsync(['node', 'tw', 'away'])

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Vacation'))
            logSpy.mockRestore()
        })
    })

    describe('set', () => {
        it('calls users.update with awayMode', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const program = createProgram()

            await program.parseAsync(['node', 'tw', 'away', 'set', 'vacation', '2026-03-20'])

            expect(apiMocks.updateUser).toHaveBeenCalledWith(
                expect.objectContaining({
                    awayMode: expect.objectContaining({
                        type: 'vacation',
                        dateTo: '2026-03-20',
                    }),
                }),
            )
            logSpy.mockRestore()
        })

        it('supports --from flag', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const program = createProgram()

            await program.parseAsync([
                'node',
                'tw',
                'away',
                'set',
                'vacation',
                '2026-03-20',
                '--from',
                '2026-03-15',
            ])

            expect(apiMocks.updateUser).toHaveBeenCalledWith({
                awayMode: { type: 'vacation', dateFrom: '2026-03-15', dateTo: '2026-03-20' },
            })
            logSpy.mockRestore()
        })

        it('shows dry-run message', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const program = createProgram()

            await program.parseAsync([
                'node',
                'tw',
                'away',
                'set',
                'vacation',
                '2026-03-20',
                '--dry-run',
            ])

            expect(apiMocks.updateUser).not.toHaveBeenCalled()
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Dry run'))
            logSpy.mockRestore()
        })

        it('rejects invalid away type', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('process.exit')
            })
            const program = createProgram()

            await expect(
                program.parseAsync(['node', 'tw', 'away', 'set', 'invalid', '2026-03-20']),
            ).rejects.toThrow()

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid away type'))
            errorSpy.mockRestore()
            exitSpy.mockRestore()
        })
    })

    describe('clear', () => {
        it('calls users.update with empty string awayMode to clear', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const program = createProgram()

            await program.parseAsync(['node', 'tw', 'away', 'clear'])

            expect(apiMocks.updateUser).toHaveBeenCalledWith({ awayMode: '' })
            expect(logSpy).toHaveBeenCalledWith('Away status cleared.')
            logSpy.mockRestore()
        })

        it('shows dry-run message', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const program = createProgram()

            await program.parseAsync(['node', 'tw', 'away', 'clear', '--dry-run'])

            expect(apiMocks.updateUser).not.toHaveBeenCalled()
            expect(logSpy).toHaveBeenCalledWith('Dry run: would clear away status')
            logSpy.mockRestore()
        })
    })
})
