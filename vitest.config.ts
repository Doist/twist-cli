import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        root: 'src',
        include: ['**/*.{test,spec}.{js,ts}'],
        exclude: ['dist/**/*', 'node_modules/**/*'],
    },
})
