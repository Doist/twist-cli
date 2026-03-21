import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import type { Command } from 'commander'
import packageJson from '../../package.json' with { type: 'json' }

const CHANGELOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CHANGELOG.md')
const CHANGELOG_URL = `https://github.com/Doist/twist-cli/blob/v${packageJson.version}/CHANGELOG.md`

function formatInline(text: string): string {
    return text
        .replace(/\*\*([^*]+)\*\*/g, (_, content) => chalk.bold(content))
        .replace(/`([^`]+)`/g, (_, code) => chalk.cyan(code))
}

function formatForTerminal(text: string): string {
    return text
        .split('\n')
        .map((line) => {
            // Version headers: # 1.25.0 or ## 1.25.0 (date) → bold green
            if (/^#{1,2} \d/.test(line)) {
                const content = line.replace(/^#{1,2} /, '')
                return chalk.green.bold(content)
            }
            // Section headers: ### Features → bold
            if (line.startsWith('### ')) {
                return chalk.bold(line.slice(4))
            }
            // Bullet items: * description → dimmed bullet + text
            if (line.startsWith('* ')) {
                return `  ${chalk.dim('•')} ${formatInline(line.slice(2))}`
            }
            return formatInline(line)
        })
        .join('\n')
}

function cleanChangelog(text: string): string {
    return (
        text
            // Version headers: # [1.25.0](https://...) or ## [1.25.0](https://...) → keep heading level
            .replace(/(#{1,2}) \[([^\]]+)\]\([^)]*\)/g, '$1 $2')
            // Remove commit hash links: ([abc1234](https://...))
            .replace(/ \([a-f0-9]{7}\)/g, '')
            .replace(/ \(\[[a-f0-9]{7}\]\([^)]*\)\)/g, '')
            // Issue/PR links: [#151](https://...) → #151
            .replace(/\[#(\d+)\]\([^)]*\)/g, '#$1')
            // Remove **deps:** dependency update lines (not useful to end users)
            .replace(/^\* \*\*deps:\*\*.*$/gm, '')
            // Remove **scope:** prefixes but keep the text: **task:** foo → foo
            .replace(/\*\*[\w-]+:\*\* /g, '')
            // Clean up blank lines left by removed dep lines
            .replace(/\n{3,}/g, '\n\n')
            // Remove section headers left empty after filtering (e.g. ### Bug Fixes with no items)
            .replace(/### [\w ]+\n\n(?=#{1,3} |$)/gm, '')
    )
}

function parseChangelog(content: string, count: number): { text: string; hasMore: boolean } {
    const sections = content.split(/\n(?=#{1,2} \[)/)
    // Skip preamble (non-version content) if present
    const versionSections = /^#{1,2} \[/.test(sections[0]) ? sections : sections.slice(1)
    const selected = versionSections.slice(0, count)

    if (selected.length === 0) {
        return { text: 'No changelog entries found.', hasMore: false }
    }

    return {
        text: cleanChangelog(selected.join('\n').trimEnd()),
        hasMore: versionSections.length > count,
    }
}

interface ChangelogOptions {
    count: string
}

export async function changelogAction(options: ChangelogOptions): Promise<void> {
    const count = parseInt(options.count, 10)
    if (Number.isNaN(count) || count < 1) {
        console.error(chalk.red('Error:'), 'Count must be a positive number')
        process.exitCode = 1
        return
    }

    let content: string
    try {
        content = await readFile(CHANGELOG_PATH, 'utf-8')
    } catch {
        console.error(chalk.red('Error:'), 'Could not read changelog file')
        process.exitCode = 1
        return
    }

    const { text, hasMore } = parseChangelog(content, count)
    console.log(formatForTerminal(text))

    if (hasMore) {
        console.log(chalk.dim(`\nView full changelog: ${CHANGELOG_URL}`))
    }
}

export function registerChangelogCommand(program: Command): void {
    program
        .command('changelog')
        .description('Show recent changelog entries')
        .option('-n, --count <number>', 'Number of versions to show', '5')
        .action(changelogAction)
}
