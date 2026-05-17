import chalk from 'chalk'
import type { TwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson } from '../../lib/output.js'
import { assertV2Available } from './helpers.js'

export async function listAccounts(options: ViewOptions, store: TwistTokenStore): Promise<void> {
    await assertV2Available()
    const records = await store.list()
    const rows = records.map(({ account, isDefault }) => ({
        id: account.id,
        label: account.label,
        isDefault,
    }))

    if (options.json) {
        console.log(formatJson(rows))
        return
    }
    if (options.ndjson) {
        console.log(formatNdjson(rows))
        return
    }

    if (rows.length === 0) {
        console.log('No stored accounts. Run `tw auth login` to add one.')
        return
    }

    const defaultRow = rows.find((r) => r.isDefault) ?? rows[0]
    console.log(`Stored accounts (${rows.length}):`)
    for (const row of rows) {
        const marker = row === defaultRow ? chalk.green('*') : ' '
        const id = chalk.dim(`id:${row.id}`)
        console.log(`  ${marker} ${id}  ${row.label}`)
    }
    console.log(`Default: ${chalk.dim(`id:${defaultRow.id}`)}  ${defaultRow.label}`)
}
