import chalk from 'chalk'
import yoctoSpinner from 'yocto-spinner'

interface SpinnerOptions {
    text: string
    color?: 'green' | 'yellow' | 'blue' | 'red' | 'gray' | 'cyan' | 'magenta'
    noSpinner?: boolean // Allow overriding spinner display
}

function shouldDisableSpinner(): boolean {
    // Check for environment variables that should disable spinners
    if (process.env.TW_SPINNER === 'false') {
        return true
    }

    // Check if we're in CI environment
    if (process.env.CI) {
        return true
    }

    // Check process arguments for flags that should disable spinner
    const args = process.argv
    const spinnerDisablingFlags = ['--json', '--ndjson', '--no-spinner', '--progress-jsonl']

    // Check for both exact matches and prefix matches (to handle --flag=value variants)
    return spinnerDisablingFlags.some(
        (flag) =>
            args.includes(flag) || // exact match
            args.some((arg) => arg.startsWith(`${flag}=`)), // prefix match with equals
    )
}

// ── Early spinner (shown before command module is loaded) ──────────────

let earlySpinnerInstance: ReturnType<typeof yoctoSpinner> | null = null
let originalStdoutWrite: typeof process.stdout.write | null = null

export function startEarlySpinner(): void {
    if (!process.stdout.isTTY || shouldDisableSpinner()) {
        return
    }

    earlySpinnerInstance = yoctoSpinner({ text: chalk.blue('Loading...') })
    earlySpinnerInstance.start()

    // Intercept stdout.write so the spinner auto-stops before any command output
    originalStdoutWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((...args: Parameters<typeof process.stdout.write>) => {
        stopEarlySpinner()
        return process.stdout.write(...args)
    }) as typeof process.stdout.write
}

export function stopEarlySpinner(): void {
    if (originalStdoutWrite) {
        process.stdout.write = originalStdoutWrite
        originalStdoutWrite = null
    }
    if (earlySpinnerInstance) {
        earlySpinnerInstance.stop()
        earlySpinnerInstance = null
    }
}

/** For tests only — reset singleton state without stopping */
export function resetEarlySpinner(): void {
    earlySpinnerInstance = null
    originalStdoutWrite = null
}

// ── LoadingSpinner (used by API calls) ─────────────────────────────────

class LoadingSpinner {
    private spinnerInstance: ReturnType<typeof yoctoSpinner> | null = null
    private adopted = false

    start(options: SpinnerOptions) {
        // Don't show spinner in non-interactive environments, when disabled via options, or when JSON output is expected
        if (!process.stdout.isTTY || options.noSpinner || shouldDisableSpinner()) {
            return this
        }

        // If an early spinner is running, adopt it instead of creating a new one
        if (earlySpinnerInstance) {
            this.spinnerInstance = earlySpinnerInstance
            this.spinnerInstance.text = chalk[options.color || 'blue'](options.text)
            earlySpinnerInstance = null
            this.adopted = true
            return this
        }

        const colorFn = chalk[options.color || 'blue']
        this.spinnerInstance = yoctoSpinner({
            text: colorFn(options.text),
        })
        this.spinnerInstance.start()
        return this
    }

    succeed(text?: string) {
        if (this.spinnerInstance) {
            if (this.adopted) {
                // Release back so subsequent API calls can re-adopt
                earlySpinnerInstance = this.spinnerInstance
                this.spinnerInstance = null
                this.adopted = false
                return
            }
            this.spinnerInstance.success(text ? chalk.green(`✓ ${text}`) : undefined)
            this.spinnerInstance = null
        }
    }

    fail(text?: string) {
        if (this.spinnerInstance) {
            // Errors always stop the spinner for real
            this.spinnerInstance.error(text ? chalk.red(`✗ ${text}`) : undefined)
            this.spinnerInstance = null
            this.adopted = false
        }
    }

    stop() {
        if (this.spinnerInstance) {
            if (this.adopted) {
                // Release back so subsequent API calls can re-adopt
                earlySpinnerInstance = this.spinnerInstance
                this.spinnerInstance = null
                this.adopted = false
                return
            }
            this.spinnerInstance.stop()
            this.spinnerInstance = null
        }
    }
}

/**
 * High-level wrapper function for running async operations with a loading spinner.
 * Automatically handles success/failure states and cleanup.
 */
export async function withSpinner<T>(
    options: SpinnerOptions,
    asyncOperation: () => Promise<T>,
): Promise<T> {
    const loadingSpinner = new LoadingSpinner().start(options)

    try {
        const result = await asyncOperation()
        loadingSpinner.stop() // Don't show success message by default - let the command handle its own output
        return result
    } catch (error) {
        loadingSpinner.fail()
        throw error
    }
}

export { LoadingSpinner, type SpinnerOptions }
