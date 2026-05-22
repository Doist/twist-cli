import { onTestFinished, vi } from 'vitest'

type ConsoleMethod = 'log' | 'error' | 'warn' | 'info'

// Spy on a console method, silence it, and auto-restore when the current test
// finishes. Returns the spy so `.mock.calls` assertions keep working.
export function captureConsole(method: ConsoleMethod = 'log') {
    const spy = vi.spyOn(console, method).mockImplementation(() => {})
    onTestFinished(() => {
        spy.mockRestore()
    })
    return spy
}
