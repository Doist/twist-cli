import { runMigrateLegacyAuth } from './lib/migrate-auth.js'
import { updateAllInstalledSkills } from './lib/skills/update-installed.js'

// Failures must not break `npm install`. `createTwistTokenStore` re-runs the
// migration lazily for users who installed with `--ignore-scripts`.
updateAllInstalledSkills({ local: false }).catch(() => {})
runMigrateLegacyAuth({ silent: true }).catch(() => {})
