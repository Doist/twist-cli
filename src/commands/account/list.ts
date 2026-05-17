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

    if (options.json) return console.log(formatJson(rows))
    if (options.ndjson) return console.log(formatNdjson(rows))

    if (rows.length === 0) {
        console.log('No stored accounts. Run `tw auth login` to add one.')
        return
    }

    console.log(`Stored accounts (${rows.length}):`)
    for (const row of rows) {
        const marker = row.isDefault ? chalk.green('*') : ' '
        console.log(`  ${marker} ${chalk.dim(`id:${row.id}`)}  ${row.label}`)
    }
    const defaultRow = rows.find((r) => r.isDefault)
    if (defaultRow) {
        console.log(`Default: ${chalk.dim(`id:${defaultRow.id}`)}  ${defaultRow.label}`)
    }
}
