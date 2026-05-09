import {
    preloadMarkdown as corePreloadMarkdown,
    renderMarkdown as coreRenderMarkdown,
} from '@doist/cli-core/markdown'

let preloadPromise: Promise<void> | null = null

function preprocessMentions(content: string): string {
    return content.replace(/\[([^\]]+)\]\((twist-mention:\/\/\d+)\)/g, '[@$1]($2)')
}

export async function preloadMarkdown(): Promise<void> {
    if (!preloadPromise) preloadPromise = corePreloadMarkdown()
    return preloadPromise
}

export async function renderMarkdown(content: string): Promise<string> {
    await preloadMarkdown()
    return coreRenderMarkdown(preprocessMentions(content))
}
