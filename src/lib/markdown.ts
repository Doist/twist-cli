import { Marked } from 'marked'
import { createTerminalRenderer, darkTheme } from 'marked-terminal-renderer'

let markedInstance: Marked | null = null

function getMarkedInstance(): Marked {
    if (!markedInstance) {
        const instance = new Marked()
        instance.use(createTerminalRenderer(darkTheme()))
        markedInstance = instance
    }
    return markedInstance
}

function preprocessMentions(content: string): string {
    return content.replace(/\[([^\]]+)\]\((twist-mention:\/\/\d+)\)/g, '[@$1]($2)')
}

export async function renderMarkdown(content: string): Promise<string> {
    const processed = preprocessMentions(content)
    const rendered = await getMarkedInstance().parse(processed)
    return rendered.trimEnd()
}
