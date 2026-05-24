import { captureConsole, createTestProgram } from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
}))

vi.mock('../../lib/api.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../lib/api.js')>()),
    getTwistClient: apiMocks.getTwistClient,
}))

vi.mock('../../lib/refs.js', () => ({
    resolveMessageId: vi.fn().mockReturnValue(200),
}))

vi.mock('../../lib/input.js', () => ({
    readStdin: vi.fn().mockResolvedValue(''),
    openEditor: vi.fn().mockResolvedValue(''),
}))

vi.mock('../../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => Promise.resolve(text)),
}))

vi.mock('chalk')

import { registerMsgCommand } from './index.js'

function createMessageFixture(id: number, creator = 1) {
    return {
        id,
        content: `Message ${id} body`,
        creator,
        conversationId: 42,
        workspaceId: 10,
        posted: new Date('2026-03-08T00:00:00.000Z'),
        url: `https://twist.com/a/10/msg/42/m/${id}`,
    }
}

function createClient({ messageCreator = 1, sessionUserId = 1 } = {}) {
    return {
        conversationMessages: {
            getMessage: vi.fn((id: number, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'message', id }
                return Promise.resolve(createMessageFixture(id, messageCreator))
            }),
            deleteMessage: vi.fn(async () => undefined),
            updateMessage: vi.fn(async (args: { id: number; content: string }) => ({
                ...createMessageFixture(args.id, messageCreator),
                content: args.content,
            })),
        },
        users: {
            getSessionUser: vi.fn((options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'sessionUser' }
                return Promise.resolve({ id: sessionUserId, name: 'Me' })
            }),
        },
        batch: vi.fn(async (...requests: Array<{ kind: string; id?: number }>) =>
            requests.map((request) => {
                if (request.kind === 'message' && request.id) {
                    return { code: 200, data: createMessageFixture(request.id, messageCreator) }
                }
                if (request.kind === 'sessionUser') {
                    return { code: 200, data: { id: sessionUserId, name: 'Me' } }
                }
                throw new Error(`Unexpected batch request: ${JSON.stringify(request)}`)
            }),
        ),
    }
}

const createProgram = () => createTestProgram(registerMsgCommand)

describe('msg implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getTwistClient.mockRejectedValue(new Error('MOCK_API_REACHED'))
    })

    it('tw msg <ref> routes to view (not unknown command)', async () => {
        const program = createProgram()
        captureConsole()

        await expect(program.parseAsync(['node', 'tw', 'msg', '200'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )
    })
})

describe('msg delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deletes a message', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'msg', 'delete', '200'])

        expect(client.conversationMessages.deleteMessage).toHaveBeenCalledWith(200)
        expect(consoleSpy).toHaveBeenCalledWith('Message 200 deleted.')
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'msg', 'delete', '200', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete message'))
        expect(consoleSpy).toHaveBeenCalledWith('  Message: 200')
        expect(consoleSpy).toHaveBeenCalledWith('  Conversation: 42')
        expect(client.conversationMessages.deleteMessage).not.toHaveBeenCalled()
    })

    it('rejects non-creator with NOT_CREATOR in dry-run', async () => {
        const client = createClient({ messageCreator: 99, sessionUserId: 1 })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'msg', 'delete', '200', '--dry-run']),
        ).rejects.toHaveProperty('code', 'NOT_CREATOR')
        expect(client.conversationMessages.deleteMessage).not.toHaveBeenCalled()
    })

    it('outputs JSON with --json', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'msg', 'delete', '200', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual({ id: 200, deleted: true })
    })
})
