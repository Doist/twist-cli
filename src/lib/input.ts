import { spawn } from 'node:child_process'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function readStdin(): Promise<string | null> {
    if (process.stdin.isTTY) {
        return null
    }

    return new Promise((resolve) => {
        let data = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (chunk) => {
            data += chunk
        })
        process.stdin.on('end', () => {
            resolve(data.trim() || null)
        })
        process.stdin.on('error', () => {
            resolve(null)
        })
    })
}

export async function openEditor(): Promise<string | null> {
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
