import { runMigrateLegacyAuth } from './lib/migrate-auth.js'
import { updateAllInstalledSkills } from './lib/skills/update-installed.js'

// Each runs independently — failures must not break `npm install`. The lazy
// fallback inside `createTwistTokenStore` covers users who installed with
// `--ignore-scripts` or whose postinstall silently failed.
updateAllInstalledSkills({ local: false }).catch(() => {})
runMigrateLegacyAuth({ silent: true }).catch(() => {})
