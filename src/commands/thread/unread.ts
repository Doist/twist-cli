import type { ThreadStateOptions } from './state-helpers.js'
import { runThreadStateCommand } from './state-helpers.js'

export async function markThreadUnread(refs: string[], options: ThreadStateOptions): Promise<void> {
    await runThreadStateCommand('unread', refs, options)
}
