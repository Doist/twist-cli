import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import { MOVED_NOTICE, printMovedNotice } from './moved.js'

vi.mock('chalk')

describe('printMovedNotice', () => {
    let originalIsTTY: boolean | undefined
    let write: MockInstance<typeof process.stderr.write>

    beforeEach(() => {
        originalIsTTY = process.stderr.isTTY
        write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
        Object.defineProperty(process.stderr, 'isTTY', {
            value: originalIsTTY,
            configurable: true,
        })
        vi.restoreAllMocks()
    })

    function setStderrTTY(value: boolean | undefined): void {
        Object.defineProperty(process.stderr, 'isTTY', { value, configurable: true })
    }

    it('writes one line to stderr when it is a TTY', () => {
        setStderrTTY(true)
        printMovedNotice('inbox')
        expect(write).toHaveBeenCalledTimes(1)
        expect(write).toHaveBeenCalledWith(`${MOVED_NOTICE}\n`)
        expect(MOVED_NOTICE).toBe('tw has moved to @todoist/twist-cli. Run "tw update" to switch.')
    })

    it('also shows for bare `tw` / `tw --help`', () => {
        setStderrTTY(true)
        printMovedNotice(undefined)
        expect(write).toHaveBeenCalledTimes(1)
    })

    it('stays silent when stderr is not a TTY', () => {
        setStderrTTY(undefined)
        printMovedNotice('inbox')
        expect(write).not.toHaveBeenCalled()
    })

    it('stays silent for `tw update`, which explains the move itself', () => {
        setStderrTTY(true)
        printMovedNotice('update')
        expect(write).not.toHaveBeenCalled()
    })
})
