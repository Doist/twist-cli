import { describe, expect, it } from 'vitest'
import type { Config, StoredUser } from './config.js'
import {
    findUserByRef,
    getDefaultUser,
    getDefaultUserId,
    getStoredUsers,
    removeStoredUser,
    setDefaultUser,
    updateStoredUser,
    upsertStoredUser,
} from './users.js'

const ALICE: StoredUser = { id: '1', email: 'alice@example.com', name: 'Alice' }
const BOB: StoredUser = { id: '2', email: 'BOB@example.com', name: 'Bob' }

function cfg(users: StoredUser[], defaultUser?: string): Config {
    const base: Config = { users }
    return defaultUser ? { ...base, user: { default_user: defaultUser } } : base
}

describe('users data layer', () => {
    it('getStoredUsers returns [] when users key missing or non-array', () => {
        expect(getStoredUsers({})).toEqual([])
        expect(getStoredUsers({ users: undefined })).toEqual([])
    })

    it('findUserByRef matches id (case-sensitive) and email (case-insensitive)', () => {
        const c = cfg([ALICE, BOB])
        expect(findUserByRef(c, '2')?.user).toBe(BOB)
        expect(findUserByRef(c, 'alice@example.com')?.user).toBe(ALICE)
        expect(findUserByRef(c, 'bob@example.com')?.user).toBe(BOB)
        expect(findUserByRef(c, 'unknown@example.com')).toBeNull()
        expect(findUserByRef(c, '   ')).toBeNull()
    })

    it('getDefaultUserId / getDefaultUser', () => {
        expect(getDefaultUserId(cfg([ALICE, BOB], '2'))).toBe('2')
        expect(getDefaultUser(cfg([ALICE, BOB], '2'))).toBe(BOB)
        expect(getDefaultUser(cfg([ALICE], 'missing'))).toBeNull()
        expect(getDefaultUser(cfg([ALICE]))).toBeNull()
    })

    it('upsertStoredUser appends new and replaces existing, signalling which', () => {
        const empty = cfg([])
        const { config: c1, replaced: r1 } = upsertStoredUser(empty, ALICE)
        expect(r1).toBe(false)
        expect(c1.users).toEqual([ALICE])

        const { config: c2, replaced: r2 } = upsertStoredUser(c1, {
            ...ALICE,
            name: 'Alice 2',
        })
        expect(r2).toBe(true)
        expect(c2.users?.[0].name).toBe('Alice 2')
    })

    it('removeStoredUser drops the entry and clears defaultUser when it pointed there', () => {
        const c = cfg([ALICE, BOB], '1')
        const after = removeStoredUser(c, '1')
        expect(after.users).toEqual([BOB])
        expect(after.user).toBeUndefined()
    })

    it('removeStoredUser keeps unrelated defaultUser intact', () => {
        const c = cfg([ALICE, BOB], '2')
        const after = removeStoredUser(c, '1')
        expect(after.user?.default_user).toBe('2')
    })

    it('setDefaultUser writes default_user', () => {
        const c = setDefaultUser(cfg([ALICE]), '1')
        expect(c.user?.default_user).toBe('1')
    })

    it('updateStoredUser patches matching user only', () => {
        const c = updateStoredUser(cfg([ALICE, BOB]), '1', { name: 'Alicia' })
        expect(c.users?.[0].name).toBe('Alicia')
        expect(c.users?.[1].name).toBe('Bob')
    })
})
