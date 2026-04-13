import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../lib/markdown.js'

describe('markdown', () => {
    it('renders markdown via marked-terminal-renderer', async () => {
        const result = await renderMarkdown('# Heading\n\n**bold** and *italic*')
        // Pretty-printed output should differ from the raw input — proves the
        // marked-terminal-renderer extension is wired up and parsing.
        expect(result).not.toBe('# Heading\n\n**bold** and *italic*')
        expect(result).toContain('Heading')
        expect(result).toContain('bold')
        expect(result).toContain('italic')
        // Markdown syntax characters should be consumed by the renderer.
        expect(result).not.toContain('#')
        expect(result).not.toContain('**')
    })

    it('renders unordered lists with bullets', async () => {
        const result = await renderMarkdown('- one\n- two\n- three')
        expect(result).toContain('one')
        expect(result).toContain('two')
        expect(result).toContain('three')
        // marked-terminal-renderer's default dark-theme list character.
        expect(result).toContain('•')
    })

    it('preprocesses twist-mention links into @mentions', async () => {
        const result = await renderMarkdown('hello [Alice](twist-mention://12345)')
        // The preprocessor turns [Name](twist-mention://N) into
        // [@Name](twist-mention://N), and the renderer keeps the @ in the
        // visible link text.
        expect(result).toContain('@Alice')
    })

    it('is idempotent across multiple calls', async () => {
        const a = await renderMarkdown('**hello**')
        const b = await renderMarkdown('**hello**')
        expect(a).toBe(b)
    })
})
