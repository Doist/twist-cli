import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type EmptyOutputConfig = {
    setup: () => void | Promise<void>
    run: (extraArgs: string[]) => Promise<void>
    humanMessage: string | RegExp
}

/**
 * Asserts the standard `printEmpty` contract for a command:
 *   --json   → prints exactly "[]"
 *   --ndjson → does not call console.log at all (no stray newline)
 *   neither  → prints the human-readable message
 *
 * `setup` runs before each test (use it to (re)wire mocks for an empty
 * result). `run` is called with the extra CLI args to append to the
 * command being tested.
 */
export function describeEmptyMachineOutput(label: string, config: EmptyOutputConfig): void {
    describe(label, () => {
        let logSpy: ReturnType<typeof vi.spyOn>

        beforeEach(async () => {
            await config.setup()
            logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        })

        afterEach(() => {
            logSpy.mockRestore()
        })

        it('outputs "[]" for --json', async () => {
            await config.run(['--json'])
            expect(logSpy).toHaveBeenCalledTimes(1)
            expect(logSpy).toHaveBeenCalledWith('[]')
        })

        it('does not call console.log for --ndjson (no stray newline)', async () => {
            await config.run(['--ndjson'])
            expect(logSpy).not.toHaveBeenCalled()
        })

        it('prints human message when no machine output flag is set', async () => {
            await config.run([])
            const output = logSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
            if (typeof config.humanMessage === 'string') {
                expect(output).toContain(config.humanMessage)
            } else {
                expect(output).toMatch(config.humanMessage)
            }
        })
    })
}
