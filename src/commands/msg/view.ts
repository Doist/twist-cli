import { getTwistClient } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { ViewOptions } from '../../lib/options.js'
import { colors, formatJson, formatNdjson } from '../../lib/output.js'
import { resolveMessageId } from '../../lib/refs.js'

export async function viewMessage(ref: string, options: ViewOptions): Promise<void> {
    const messageId = resolveMessageId(ref)
    const client = await getTwistClient()
    const message = await client.conversationMessages.getMessage(messageId)

    const userResponse = await client.workspaceUsers.getUserById(
        { workspaceId: message.workspaceId, userId: message.creator },
        { batch: false },
    )
    const creatorName = userResponse.name

    if (options.json) {
        const output = { ...message, creatorName }
        console.log(formatJson(output, options.full ? undefined : 'message', options.full))
        return
    }

    if (options.ndjson) {
        const output = { ...message, creatorName }
        console.log(formatNdjson([output], options.full ? undefined : 'message', options.full))
        return
    }

    const author = colors.author(creatorName)
    const time = colors.timestamp(formatRelativeDate(message.posted))
    console.log(`${author}  ${time}  ${colors.timestamp(`id:${message.id}`)}`)
    console.log(options.raw ? message.content : renderMarkdown(message.content))
    console.log('')
}
