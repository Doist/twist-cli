import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getRequestedUserRef: vi.fn<() => string | undefined>(),
}))

vi.mock('../../lib/global-args.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/global-args.js')>()
    return {
        ...actual,
        getRequestedUserRef: mocks.getRequestedUserRef,
    }
})

import type { TwistAccount, TwistTokenStore } from '../../lib/auth-provider.js'
import { withUserRefAware } from './store-wrap.js'

function createFakeStore(): {
    store: TwistTokenStore
    spies: {
        active: ReturnType<typeof vi.fn>
        set: ReturnType<typeof vi.fn>
        clear: ReturnType<typeof vi.fn>
        list: ReturnType<typeof vi.fn>
        setDefault: ReturnType<typeof vi.fn>
        getLastStorageResult: ReturnType<typeof vi.fn>
        getLastClearResult: ReturnType<typeof vi.fn>
    }
} {
    const spies = {
        active: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        setDefault: vi.fn().mockResolvedValue(undefined),
        getLastStorageResult: vi.fn().mockReturnValue(undefined),
        getLastClearResult: vi.fn().mockReturnValue(undefined),
    }
    return { store: spies as unknown as TwistTokenStore, spies }
}

describe('withUserRefAware', () => {
    beforeEach(() => {
        mocks.getRequestedUserRef.mockReset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('substitutes the global --user ref when active() is called without an explicit ref', async () => {
        mocks.getRequestedUserRef.mockReturnValue('42')
        const { store, spies } = createFakeStore()

        await withUserRefAware(store).active()

        expect(spies.active).toHaveBeenCalledWith('42')
    })

    it('substitutes the global --user ref when clear() is called without an explicit ref', async () => {
        mocks.getRequestedUserRef.mockReturnValue('Ada')
        const { store, spies } = createFakeStore()

        await withUserRefAware(store).clear()

        expect(spies.clear).toHaveBeenCalledWith('Ada')
    })

    it('preserves the explicit ref so per-command --user wins over the global flag', async () => {
        mocks.getRequestedUserRef.mockReturnValue('global')
        const { store, spies } = createFakeStore()

        await withUserRefAware(store).active('explicit')
        await withUserRefAware(store).clear('explicit')

        expect(spies.active).toHaveBeenCalledWith('explicit')
        expect(spies.clear).toHaveBeenCalledWith('explicit')
    })

    it('passes undefined through when neither explicit ref nor global flag is set', async () => {
        mocks.getRequestedUserRef.mockReturnValue(undefined)
        const { store, spies } = createFakeStore()

        await withUserRefAware(store).active()
        await withUserRefAware(store).clear()

        expect(spies.active).toHaveBeenCalledWith(undefined)
        expect(spies.clear).toHaveBeenCalledWith(undefined)
    })

    it('passes set / list / setDefault through without consulting the global ref', async () => {
        mocks.getRequestedUserRef.mockReturnValue('42')
        const { store, spies } = createFakeStore()
        const account: TwistAccount = {
            id: '7',
            label: 'Bea',
            authMode: 'read-write',
            authScope: 'user:read',
        }

        const wrapped = withUserRefAware(store)
        await wrapped.set(account, 'tk_xyz')
        await wrapped.list()
        await wrapped.setDefault('7')

        expect(spies.set).toHaveBeenCalledWith(account, 'tk_xyz')
        expect(spies.list).toHaveBeenCalled()
        expect(spies.setDefault).toHaveBeenCalledWith('7')
        expect(mocks.getRequestedUserRef).not.toHaveBeenCalled()
    })

    it('exposes the twist-specific getLastStorageResult / getLastClearResult accessors', () => {
        const { store, spies } = createFakeStore()
        spies.getLastStorageResult.mockReturnValue({ storage: 'secure-store' })
        spies.getLastClearResult.mockReturnValue({ storage: 'config-file' })

        const wrapped = withUserRefAware(store)

        expect(wrapped.getLastStorageResult()).toEqual({ storage: 'secure-store' })
        expect(wrapped.getLastClearResult()).toEqual({ storage: 'config-file' })
    })
})
