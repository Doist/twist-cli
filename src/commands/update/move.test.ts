import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import packageJson from '../../../package.json' with { type: 'json' }

vi.mock('chalk')

const NEW_VERSION = '4.0.1'

describe('tw update moves to @todoist/twist-cli', () => {
    const originalArgv = [...process.argv]
    let tmpConfigPath: string
    let spawnMock: ReturnType<typeof vi.fn>
    let exitCodes: number[]
    let fetchMock: ReturnType<typeof vi.fn>
    let log: MockInstance<typeof console.log>

    beforeEach(() => {
        tmpConfigPath = join(mkdtempSync(join(tmpdir(), 'twist-move-test-')), 'config.json')
        vi.doMock('../../lib/config.js', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../../lib/config.js')>()
            return { ...actual, getConfigPath: () => tmpConfigPath }
        })

        // Each spawned package-manager run exits with the next queued code (default 0).
        exitCodes = []
        spawnMock = vi.fn(() => {
            const child = new EventEmitter()
            const code = exitCodes.shift() ?? 0
            setImmediate(() => child.emit('close', code))
            return child
        })
        vi.doMock('node:child_process', async (importOriginal) => ({
            ...(await importOriginal<typeof import('node:child_process')>()),
            spawn: spawnMock,
        }))

        fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ version: NEW_VERSION }),
        })
        vi.stubGlobal('fetch', fetchMock)

        // Pin package-manager detection to a plain npm global install.
        vi.stubEnv('npm_execpath', '')
        process.argv = ['node', '/usr/local/lib/node_modules/@doist/twist-cli/dist/index.js']

        log = vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        process.argv = originalArgv
        vi.doUnmock('../../lib/config.js')
        vi.doUnmock('node:child_process')
        vi.resetModules()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
    })

    async function runUpdate(...args: string[]): Promise<void> {
        const { registerUpdateCommand } = await import('./index.js')
        const program = new Command()
        program.exitOverride()
        registerUpdateCommand(program)
        await program.parseAsync(['node', 'tw', 'update', ...args])
    }

    function spawnedCommands(): string[] {
        return spawnMock.mock.calls.map(([pm, args]) => [pm, ...(args as string[])].join(' '))
    }

    function output(): string {
        return log.mock.calls.map((call) => String(call[0])).join('\n')
    }

    it('uninstalls the old package before installing the new one, streaming output', async () => {
        await runUpdate()

        expect(spawnedCommands()).toEqual([
            'npm uninstall -g @doist/twist-cli',
            'npm install -g @todoist/twist-cli@latest',
        ])
        for (const [, , options] of spawnMock.mock.calls) {
            expect(options).toMatchObject({ stdio: 'inherit' })
        }
        expect(fetchMock.mock.calls[0][0]).toContain('@todoist/twist-cli/latest')
        expect(output()).toContain(`Installed @todoist/twist-cli v${NEW_VERSION}`)
        expect(output()).toContain('same config and login')
    })

    it('uses pnpm remove/add when installed through pnpm', async () => {
        process.argv = ['node', '/home/me/.local/share/pnpm/global/5/node_modules/tw/index.js']

        await runUpdate()

        expect(spawnedCommands()).toEqual([
            'pnpm remove -g @doist/twist-cli',
            'pnpm add -g @todoist/twist-cli@latest',
        ])
    })

    it('installs the next dist-tag on the pre-release channel', async () => {
        writeFileSync(tmpConfigPath, JSON.stringify({ update_channel: 'pre-release' }))

        await runUpdate()

        expect(spawnedCommands()[1]).toBe('npm install -g @todoist/twist-cli@next')
    })

    it('falls back to latest when the new package has no next dist-tag', async () => {
        writeFileSync(tmpConfigPath, JSON.stringify({ update_channel: 'pre-release' }))
        fetchMock.mockImplementation((url: string) =>
            Promise.resolve(
                url.endsWith('/next')
                    ? { ok: false, status: 404 }
                    : { ok: true, json: () => Promise.resolve({ version: NEW_VERSION }) },
            ),
        )

        await runUpdate()

        expect(spawnedCommands()[1]).toBe('npm install -g @todoist/twist-cli@latest')
    })

    it('restores the old package when installing the new one fails', async () => {
        exitCodes = [0, 1, 0]

        await expect(runUpdate()).rejects.toMatchObject({
            code: 'UPDATE_INSTALL_FAILED',
            message: expect.stringContaining(
                `@doist/twist-cli v${packageJson.version} was restored`,
            ),
            hints: expect.arrayContaining(['npm install -g @todoist/twist-cli@latest']),
        })
        expect(spawnedCommands()).toEqual([
            'npm uninstall -g @doist/twist-cli',
            'npm install -g @todoist/twist-cli@latest',
            `npm install -g @doist/twist-cli@${packageJson.version}`,
        ])
    })

    it('says tw may be gone when the restore fails too', async () => {
        exitCodes = [0, 1, 1]

        await expect(runUpdate()).rejects.toMatchObject({
            code: 'UPDATE_INSTALL_FAILED',
            message: expect.stringContaining('tw may no longer be installed'),
        })
    })

    it('stops without installing when the uninstall fails', async () => {
        exitCodes = [243]

        await expect(runUpdate()).rejects.toMatchObject({ code: 'UPDATE_INSTALL_FAILED' })
        expect(spawnedCommands()).toEqual(['npm uninstall -g @doist/twist-cli'])
    })

    it('changes nothing when the registry lookup fails', async () => {
        fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

        await expect(runUpdate()).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
        expect(spawnMock).not.toHaveBeenCalled()
    })

    it('--check reports the move without changing anything', async () => {
        await runUpdate('--check')

        expect(spawnMock).not.toHaveBeenCalled()
        expect(fetchMock).not.toHaveBeenCalled()
        expect(output()).toContain('tw has moved to @todoist/twist-cli')
        expect(output()).toContain('npm uninstall -g @doist/twist-cli')
        expect(output()).toContain('npm install -g @todoist/twist-cli@latest')
    })

    it('--json reports the move without changing anything', async () => {
        await runUpdate('--json')

        expect(spawnMock).not.toHaveBeenCalled()
        expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({
            currentVersion: packageJson.version,
            channel: 'stable',
            movedTo: '@todoist/twist-cli',
            installed: false,
            command: 'tw update',
            manualCommands: [
                'npm uninstall -g @doist/twist-cli',
                'npm install -g @todoist/twist-cli@latest',
            ],
        })
    })

    it('--check --ndjson reports the move as a single record', async () => {
        await runUpdate('--check', '--ndjson')

        expect(spawnMock).not.toHaveBeenCalled()
        expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
            movedTo: '@todoist/twist-cli',
            updateAvailable: true,
        })
    })
})
