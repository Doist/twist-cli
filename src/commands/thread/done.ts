import type { ThreadStateOptions } from './state-helpers.js'
import { runThreadStateCommand } from './state-helpers.js'

export async function markThreadDone(refs: string[], options: ThreadStateOptions): Promise<void> {
    await runThreadStateCommand('done', refs, options)
}
