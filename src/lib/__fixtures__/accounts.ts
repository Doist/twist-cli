import type { TwistAccount } from '../auth-provider.js'
import type { StoredUser } from '../config.js'

// StoredUser is the on-disk shape (`name`); TwistAccount is the in-memory
// shape (`label`, required `authScope`). ACCOUNT_* fixtures spread STORED_*
// + add the account-only fields so a future field only needs to land once.

export const STORED_ALAN: StoredUser = { id: '1', name: 'Alan Grant', authMode: 'read-write' }
export const STORED_ELLIE: StoredUser = { id: '2', name: 'Ellie Sattler', authMode: 'read-only' }

export const ACCOUNT_ALAN: TwistAccount = {
    ...STORED_ALAN,
    label: STORED_ALAN.name,
    authMode: 'read-write',
    authScope: 'user:read',
}

export const ACCOUNT_ELLIE: TwistAccount = {
    ...STORED_ELLIE,
    label: STORED_ELLIE.name,
    authMode: 'read-only',
    authScope: 'user:read',
}
