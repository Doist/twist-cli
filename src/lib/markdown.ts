import { marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

marked.use(markedTerminal())

function preprocessMentions(content: string): string {
    return content.replace(/\[([^\]]+)\]\((twist-mention:\/\/\d+)\)/g, '[@$1]($2)')
}

export function renderMarkdown(content: string): string {
    const processed = preprocessMentions(content)
    const rendered = marked.parse(processed, { async: false }) as string
    return rendered.trimEnd()
}
