import { afterEach, describe, expect, it } from 'vitest'
import { parseGlobalArgs, resetGlobalArgs, stripUserFlag, validateUserFlag } from './global-args.js'

const KNOWN = new Set(['inbox', 'thread', 'auth', 'account', 'channel'])

describe('--user flag parsing', () => {
    afterEach(() => resetGlobalArgs())

    it.each([
        ['--user me@example.com', ['--user', 'me@example.com'], 'me@example.com'],
        ['--user=me@example.com', ['--user=me@example.com'], 'me@example.com'],
        ['--user 42', ['--user', '42'], '42'],
        ['no flag', ['inbox'], undefined],
    ])('%s', (_, argv, expected) => {
        expect(parseGlobalArgs(argv).user).toBe(expected)
    })

    it('leaves user undefined when the next token is another flag', () => {
        expect(parseGlobalArgs(['--user', '--json', 'inbox']).user).toBeUndefined()
    })

    it('treats tokens after `--` as positional', () => {
        expect(parseGlobalArgs(['--', '--user', 'someone']).user).toBeUndefined()
    })
})

describe('stripUserFlag', () => {
    afterEach(() => resetGlobalArgs())

    it('removes space form', () => {
        expect(stripUserFlag(['--user', 'me@example.com', 'inbox'])).toEqual(['inbox'])
    })

    it('removes equals form', () => {
        expect(stripUserFlag(['--user=me@example.com', 'inbox'])).toEqual(['inbox'])
    })

    it('preserves tokens after the terminator', () => {
        expect(stripUserFlag(['inbox', '--', '--user', 'x'])).toEqual([
            'inbox',
            '--',
            '--user',
            'x',
        ])
    })

    it('leaves the next flag intact when --user lacks a value', () => {
        expect(stripUserFlag(['--user', '--json', 'inbox'])).toEqual(['--json', 'inbox'])
    })
})

describe('validateUserFlag', () => {
    afterEach(() => resetGlobalArgs())

    it('returns ok: true with undefined ref when --user is absent', () => {
        expect(validateUserFlag(['inbox'], KNOWN)).toEqual({ ok: true, ref: undefined })
    })

    it('returns ok: true with the value', () => {
        expect(validateUserFlag(['--user', 'me@example.com', 'inbox'], KNOWN)).toEqual({
            ok: true,
            ref: 'me@example.com',
        })
    })

    it('rejects bare --user', () => {
        const result = validateUserFlag(['--user'], KNOWN)
        expect(result.ok).toBe(false)
    })

    it('rejects --user= (empty value)', () => {
        expect(validateUserFlag(['--user='], KNOWN).ok).toBe(false)
    })

    it('rejects --user <known-subcommand>', () => {
        const result = validateUserFlag(['--user', 'inbox'], KNOWN)
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.message).toContain('looks like a subcommand')
        }
    })

    it('--user-shaped tokens after `--` are positional, not flag instances', () => {
        expect(validateUserFlag(['inbox', '--', '--user', 'x'], KNOWN)).toEqual({
            ok: true,
            ref: undefined,
        })
    })
})
