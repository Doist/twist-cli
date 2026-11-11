import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        root: 'src',
        include: ['**/*.{test,spec}.{js,ts}'],
        exclude: ['dist/**/*', 'node_modules/**/*'],
        // Inline @todoist/cli-core so vitest's module mocks (e.g. vi.doMock for
        // 'node:fs/promises' or vi.mock('@todoist/cli-core', …)) reach its
        // compiled imports. Without this, vitest treats it as external and
        // Node's native resolver bypasses the mock substitution.
        server: {
            deps: {
                inline: ['@todoist/cli-core'],
            },
        },
    },
})
