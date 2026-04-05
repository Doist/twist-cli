import { spawn } from 'node:child_process'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function isNonInteractive(): boolean {
    const args = process.argv
    if (args.includes('--interactive')) return false
    if (args.includes('--non-interactive')) return true
    return !process.stdin.isTTY
}

const STDIN_TIMEOUT_MS = 100

export async function readStdin(): Promise<string | null> {
    if (process.stdin.isTTY) {
        return null
    }

    return new Promise((resolve) => {
        let data = ''
        let settled = false
        let timeout: ReturnType<typeof setTimeout> | undefined

        const settle = (value: string | null) => {
            if (settled) return
            settled = true
            if (timeout) clearTimeout(timeout)
            process.stdin.removeListener('data', onData)
            process.stdin.removeListener('end', onEnd)
            process.stdin.removeListener('error', onError)
            resolve(value)
        }

        const onData = (chunk: string) => {
            data += chunk
            // Data arrived — clear any non-interactive timeout and wait for end
            if (timeout) {
                clearTimeout(timeout)
                timeout = undefined
            }
        }
        const onEnd = () => settle(data.trim() || null)
        const onError = () => settle(null)

        process.stdin.setEncoding('utf8')
        process.stdin.on('data', onData)
        process.stdin.on('end', onEnd)
        process.stdin.on('error', onError)

        // In non-interactive mode, don't wait indefinitely for a pipe that may never close
        if (isNonInteractive()) {
            timeout = setTimeout(() => {
                settle(data.trim() || null)
            }, STDIN_TIMEOUT_MS)
        }
    })
}

export async function openEditor(): Promise<string | null> {
    if (isNonInteractive()) {
        return null
    }

    const editor = process.env.EDITOR || process.env.VISUAL || 'vi'
    const tmpFile = join(tmpdir(), `twist-cli-${Date.now()}.md`)

    await writeFile(tmpFile, '')

    return new Promise((resolve) => {
        const child = spawn(editor, [tmpFile], {
            stdio: 'inherit',
        })

        child.on('exit', async (code) => {
            if (code !== 0) {
                await unlink(tmpFile).catch(() => {})
                resolve(null)
                return
            }

            try {
                const content = await readFile(tmpFile, 'utf8')
                await unlink(tmpFile).catch(() => {})
                resolve(content.trim() || null)
            } catch {
                resolve(null)
            }
        })

        child.on('error', async () => {
            await unlink(tmpFile).catch(() => {})
            resolve(null)
        })
    })
}
