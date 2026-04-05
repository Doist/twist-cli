import type { SupportedShell } from '@pnpm/tabtab'
import { CliError } from '../../lib/errors.js'
import { resolveCompleterCommand } from './helpers.js'

export async function installCompletion(shell?: string): Promise<void> {
    const tabtab = await import('@pnpm/tabtab')
    const completer = resolveCompleterCommand()

    if (shell && !tabtab.isShellSupported(shell)) {
        throw new CliError(
            'INVALID_TYPE',
            `Unsupported shell: ${shell}. Supported: ${tabtab.SUPPORTED_SHELLS.join(', ')}`,
        )
    }

    await tabtab.install({
        name: 'tw',
        // Use the executable path used to install completions so shell
        // completion doesn't accidentally call an older `tw` on PATH.
        completer,
        shell: shell as SupportedShell,
    })

    console.log('Shell completions installed successfully.')
    console.log('Restart your shell or source your shell config to activate.')
}
