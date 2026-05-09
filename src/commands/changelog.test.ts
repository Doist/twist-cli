import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises')

import { readFile } from 'node:fs/promises'
import packageJson from '../../package.json' with { type: 'json' }
import { registerChangelogCommand } from './changelog.js'

const mockReadFile = vi.mocked(readFile)

// Fixture exercises the three twist-specific options:
//   - headingLevel: 'flexible' — accepts both `# 1.x` and `## 1.x`
//   - continuationIndent: true — wrapped-bullet line is indented under bullet
//   - filterEmptyVersions: true — deps-only release is dropped from output
const SAMPLE_CHANGELOG = `# Changelog

# [9.9.0](https://example.com) (2026-05-09)

### Features
* delegated changelog rendering to cli-core
  with a wrapped continuation line that should stay indented under the bullet

# [9.8.5](https://example.com) (2026-05-08)

### Bug Fixes
* **deps:** bump @doist/cli-core from 0.8.0 to 0.9.0

## [9.8.0](https://example.com) (2026-05-07)

### Features
* prior release with a level-2 heading
`

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerChangelogCommand(program)
    return program
}

describe('changelog wrapper', () => {
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
        mockReadFile.mockReset()
    })

    it('passes the twist CHANGELOG.md path through to cli-core', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)

        await createProgram().parseAsync(['node', 'tw', 'changelog', '-n', '1'])

        expect(mockReadFile).toHaveBeenCalledTimes(1)
        const [path] = mockReadFile.mock.calls[0]
        expect(String(path)).toMatch(/\/CHANGELOG\.md$/)
    })

    it('emits a footer link pointing at the twist repo and current version', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)

        await createProgram().parseAsync(['node', 'tw', 'changelog', '-n', '1'])

        const all = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(all).toContain(
            `View full changelog: https://github.com/Doist/twist-cli/blob/v${packageJson.version}/CHANGELOG.md`,
        )
    })

    it('renders both # and ## version headings (headingLevel: flexible)', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)

        await createProgram().parseAsync(['node', 'tw', 'changelog', '-n', '5'])

        const all = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(all).toContain('9.9.0')
        expect(all).toContain('9.8.0')
        // Heading prefix should be consumed by the formatter — neither `# `
        // nor `## ` should leak into rendered output.
        expect(all).not.toMatch(/^# 9\.9\.0/m)
        expect(all).not.toMatch(/^## 9\.8\.0/m)
    })

    it('drops deps-only versions (filterEmptyVersions: true)', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)

        await createProgram().parseAsync(['node', 'tw', 'changelog', '-n', '5'])

        const all = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(all).not.toContain('9.8.5')
        expect(all).not.toContain('@doist/cli-core from 0.8.0 to 0.9.0')
    })

    it('indents continuation lines under bullets (continuationIndent: true)', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)

        await createProgram().parseAsync(['node', 'tw', 'changelog', '-n', '1'])

        const all = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        // Continuation line should be indented under the bullet (more
        // leading whitespace than `  • `, the rendered bullet prefix).
        expect(all).toMatch(/^ {4,}with a wrapped continuation line/m)
    })
})
