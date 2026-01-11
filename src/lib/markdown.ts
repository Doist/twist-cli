import { marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

marked.use(markedTerminal())

export function renderMarkdown(content: string): string {
  const rendered = marked.parse(content, { async: false }) as string
  return rendered.trimEnd()
}
