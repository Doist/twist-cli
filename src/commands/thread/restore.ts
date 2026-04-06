import type { ThreadStateOptions } from './state-helpers.js'
import { runThreadStateCommand } from './state-helpers.js'

export async function restoreThread(refs: string[], options: ThreadStateOptions): Promise<void> {
    await runThreadStateCommand('restore', refs, options)
}
