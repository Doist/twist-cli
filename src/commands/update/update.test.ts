import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../../package.json' with { type: 'json' }

describe('update wrapper', () => {
    let tmpConfigPath: string

    beforeEach(() => {
        tmpConfigPath = join(mkdtempSync(join(tmpdir(), 'twist-update-test-')), 'config.json')
        vi.doMock('../../lib/config.js', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../../lib/config.js')>()
            return { ...actual, getConfigPath: () => tmpConfigPath }
        })
    })

    afterEach(() => {
        vi.doUnmock('@doist/cli-core/commands')
        vi.doUnmock('../../lib/config.js')
        vi.resetModules()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('forwards twist-cli wiring (packageName, version, configPath, changelog hint, spinner) to cli-core', async () => {
        const registerCoreSpy = vi.fn()
        vi.doMock('@doist/cli-core/commands', () => ({
            registerUpdateCommand: registerCoreSpy,
            // Re-exported by src/lib/update.ts — must still resolve when the
            // mocked module is loaded transitively via the wrapper.
            fetchLatestVersion: vi.fn(),
            compareVersions: vi.fn(),
            isNewer: vi.fn(),
            parseVersion: vi.fn(),
            getInstallTag: vi.fn(),
            getConfiguredUpdateChannel: vi.fn(),
        }))

        const { registerUpdateCommand } = await import('./index.js')
        const { withSpinner } = await import('../../lib/spinner.js')
        const program = new Command()
        registerUpdateCommand(program)

        expect(registerCoreSpy).toHaveBeenCalledTimes(1)
        const [passedProgram, options] = registerCoreSpy.mock.calls[0]
        expect(passedProgram).toBe(program)
        expect(options).toEqual({
            packageName: packageJson.name,
            currentVersion: packageJson.version,
            configPath: tmpConfigPath,
            changelogCommandName: 'tw changelog',
            withSpinner,
        })
    })

    it('migrates a legacy-only updateChannel on disk so cli-core can read it', async () => {
        writeFileSync(tmpConfigPath, JSON.stringify({ updateChannel: 'pre-release' }))
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ version: packageJson.version }),
            }),
        )

        const { registerUpdateCommand } = await import('./index.js')
        const program = new Command()
        program.exitOverride()
        registerUpdateCommand(program)

        await program.parseAsync(['node', 'tw', 'update', '--check'])

        // After the preAction hook ran, the on-disk file should carry both
        // keys so cli-core's `update_channel` read succeeds going forward.
        const onDisk = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'))
        expect(onDisk).toMatchObject({
            updateChannel: 'pre-release',
            update_channel: 'pre-release',
        })
    })

    it('reads the persisted channel through cli-core (hermetic against the real config)', async () => {
        writeFileSync(tmpConfigPath, JSON.stringify({ update_channel: 'pre-release' }))
        vi.stubGlobal('fetch', vi.fn())
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        const { registerUpdateCommand } = await import('./index.js')
        const program = new Command()
        program.exitOverride()
        registerUpdateCommand(program)

        await program.parseAsync(['node', 'tw', 'update', '--channel', '--json'])

        expect(JSON.parse(log.mock.calls[0][0])).toEqual({ channel: 'pre-release' })
    })

    it('keeps `update switch` writing the channel to the config', async () => {
        writeFileSync(tmpConfigPath, JSON.stringify({ update_channel: 'stable' }))
        vi.spyOn(console, 'log').mockImplementation(() => {})

        const { registerUpdateCommand } = await import('./index.js')
        const program = new Command()
        program.exitOverride()
        registerUpdateCommand(program)

        await program.parseAsync(['node', 'tw', 'update', 'switch', '--pre-release'])

        expect(JSON.parse(readFileSync(tmpConfigPath, 'utf-8'))).toMatchObject({
            update_channel: 'pre-release',
        })
    })

    it('surfaces INVALID_UPDATE_CHANNEL when on-disk update_channel is unknown', async () => {
        writeFileSync(tmpConfigPath, JSON.stringify({ update_channel: 'beta' }))
        vi.stubGlobal('fetch', vi.fn())

        const { registerUpdateCommand } = await import('./index.js')
        const program = new Command()
        program.exitOverride()
        registerUpdateCommand(program)

        await expect(program.parseAsync(['node', 'tw', 'update', '--check'])).rejects.toMatchObject(
            { code: 'INVALID_UPDATE_CHANNEL' },
        )
    })
})
