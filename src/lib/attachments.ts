import type { Attachment } from '@doist/twist-sdk'
import { getTwistClient } from './api.js'
import { openLocalFileAsBlob } from './local-file.js'

/**
 * Upload one or more local files and return the created {@link Attachment}s,
 * ready to splice into the `attachments` array of `comments.createComment` or
 * `conversationMessages.createMessage`.
 *
 * All paths are validated (existence + readability) up front, before any
 * upload starts, so a bad path fails fast without leaving a partial set of
 * uploaded-but-unreferenced attachments behind. Uploads then run concurrently
 * while the returned array preserves the input order.
 */
export async function uploadAttachments(files: string[]): Promise<Attachment[]> {
    // Validate every path first so a bad one fails before we upload anything.
    const opened = await Promise.all(files.map((file) => openLocalFileAsBlob({ file })))

    const client = await getTwistClient()
    return Promise.all(
        opened.map(({ blob, fileName }) => client.attachments.upload({ file: blob, fileName })),
    )
}

export type { Attachment }
