import type { TwistAccount } from '../auth-provider.js'
import type { StoredUser } from '../config.js'

export const STORED_ALAN: StoredUser = { id: '1', name: 'Alan Grant', authMode: 'read-write' }
export const STORED_ELLIE: StoredUser = { id: '2', name: 'Ellie Sattler', authMode: 'read-only' }

// Built explicitly (no spread) so TwistAccount fixtures don't carry a
// hidden `name` field that would weaken the type boundary.
export const ACCOUNT_ALAN: TwistAccount = {
    id: STORED_ALAN.id,
    label: STORED_ALAN.name,
    authMode: 'read-write',
    authScope: 'user:read',
}

export const ACCOUNT_ELLIE: TwistAccount = {
    id: STORED_ELLIE.id,
    label: STORED_ELLIE.name,
    authMode: 'read-only',
    authScope: 'user:read',
}
