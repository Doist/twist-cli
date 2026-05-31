import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openLocalFileAsBlob } from './local-file.js'

describe('openLocalFileAsBlob', () => {
    let tmpDir: string
    let filePath: string

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'tw-localfile-'))
        filePath = join(tmpDir, 'diagram.png')
        await writeFile(filePath, 'hello-bytes')
    })

    afterAll(async () => {
        await rm(tmpDir, { recursive: true, force: true })
    })

    it('returns a file-backed Blob and the basename as fileName', async () => {
        const { blob, fileName, filePath: resolved } = await openLocalFileAsBlob({ file: filePath })
        expect(blob).toBeInstanceOf(Blob)
        expect(await blob.text()).toBe('hello-bytes')
        expect(fileName).toBe('diagram.png')
        expect(resolved).toBe(filePath)
    })

    it('honours an explicit fileName override', async () => {
        const { fileName } = await openLocalFileAsBlob({ file: filePath, fileName: 'renamed.png' })
        expect(fileName).toBe('renamed.png')
    })

    it('throws FILE_NOT_FOUND for a missing path', async () => {
        await expect(openLocalFileAsBlob({ file: join(tmpDir, 'nope.png') })).rejects.toMatchObject(
            { code: 'FILE_NOT_FOUND' },
        )
    })
})
