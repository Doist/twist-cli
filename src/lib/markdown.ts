import { type MarkedExtension, marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

let initialized = false

function preprocessMentions(content: string): string {
    return content.replace(/\[([^\]]+)\]\((twist-mention:\/\/\d+)\)/g, '[@$1]($2)')
}

export function renderMarkdown(content: string): string {
    if (!initialized) {
        marked.use(markedTerminal() as unknown as MarkedExtension)
        initialized = true
    }
    const processed = preprocessMentions(content)
    const rendered = marked.parse(processed, { async: false }) as string
    return rendered.trimEnd()
}
