import type { ThreadStateOptions } from './state-helpers.js'
import { runThreadStateCommand } from './state-helpers.js'

export async function markThreadRead(refs: string[], options: ThreadStateOptions): Promise<void> {
    await runThreadStateCommand('read', refs, options)
}
