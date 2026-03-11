import { describe, expect, it } from 'vitest'
import { buildAuthorizationUrl, READ_ONLY_SCOPES, READ_WRITE_SCOPES } from '../../lib/oauth.js'

describe('buildAuthorizationUrl', () => {
    const clientId = 'test-client-id'
    const codeChallenge = 'test-challenge'
    const state = 'test-state'

    it('uses read-write scopes by default', () => {
        const url = buildAuthorizationUrl(clientId, codeChallenge, state)
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe(READ_WRITE_SCOPES)
    })

    it('uses read-only scopes when requested', () => {
        const url = buildAuthorizationUrl(clientId, codeChallenge, state, { readOnly: true })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe(READ_ONLY_SCOPES)
    })

    it('read-only scopes contain no write scopes', () => {
        expect(READ_ONLY_SCOPES).not.toContain(':write')
    })

    it('read-write scopes contain write scopes', () => {
        expect(READ_WRITE_SCOPES).toContain(':write')
    })
})
