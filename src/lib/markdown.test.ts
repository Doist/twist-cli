import { beforeAll, describe, expect, it } from 'vitest'
import { preloadMarkdown, renderMarkdown } from './markdown.js'

describe('markdown', () => {
    beforeAll(async () => {
        await preloadMarkdown()
    })

    it('renders markdown via cli-core/markdown', async () => {
        const result = await renderMarkdown('# Heading\n\n**bold** and *italic*')
        expect(result).not.toBe('# Heading\n\n**bold** and *italic*')
        expect(result).toContain('Heading')
        expect(result).toContain('bold')
        expect(result).toContain('italic')
        expect(result).not.toContain('#')
        expect(result).not.toContain('**')
    })

    it('renders unordered lists with bullets', async () => {
        const result = await renderMarkdown('- one\n- two\n- three')
        expect(result).toContain('one')
        expect(result).toContain('two')
        expect(result).toContain('three')
        expect(result).toContain('•')
    })

    it('preprocesses twist-mention links into @mentions', async () => {
        const result = await renderMarkdown('hello [Alice](twist-mention://12345)')
        expect(result).toContain('@Alice')
    })

    it('is idempotent across multiple calls', async () => {
        const a = await renderMarkdown('**hello**')
        const b = await renderMarkdown('**hello**')
        expect(a).toBe(b)
    })
})
