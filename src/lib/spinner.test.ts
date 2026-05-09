import { describe, expect, it, vi } from 'vitest'

// Mock cli-core's createSpinner to capture the SpinnerConfig passed in.
// Anything else the kit exposes is irrelevant for this wiring test — we just
// need to assert that twist's spinner.ts hands shouldDisableSpinner over as
// `isDisabled`. Without this, a renamed export or a missing destructure would
// pass type-check (the runtime call still type-checks against `() => boolean`)
// and CI would never notice.
const createSpinnerMock = vi.fn(() => ({
    LoadingSpinner: class {},
    withSpinner: vi.fn(),
    startEarlySpinner: vi.fn(),
    stopEarlySpinner: vi.fn(),
    resetEarlySpinner: vi.fn(),
}))

vi.mock('@doist/cli-core', async () => {
    const actual = await vi.importActual<typeof import('@doist/cli-core')>('@doist/cli-core')
    return {
        ...actual,
        createSpinner: createSpinnerMock,
    }
})

describe('spinner.ts wiring', () => {
    it('passes shouldDisableSpinner to createSpinner as isDisabled', async () => {
        const { shouldDisableSpinner } = await import('./global-args.js')
        await import('./spinner.js')

        expect(createSpinnerMock).toHaveBeenCalledWith({ isDisabled: shouldDisableSpinner })
    })
})
