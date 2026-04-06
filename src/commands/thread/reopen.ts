import type { ThreadStateOptions } from './state-helpers.js'
import { runThreadStateCommand } from './state-helpers.js'

export async function reopenThread(refs: string[], options: ThreadStateOptions): Promise<void> {
    await runThreadStateCommand('reopen', refs, options)
}
