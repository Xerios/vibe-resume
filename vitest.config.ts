import { defineConfig } from 'vitest/config'

// Each package is a plain Vite project rooted at itself. The app has no tests
// of its own, and its vite.config.js would not do here anyway: SvelteKit's
// plugin pins Vite's root to the working directory, which would point
// root-relative imports at the repository root instead of the package.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: 'packages/core' } },
      { test: { name: 'format-yaml', root: 'packages/format-yaml' } },
      { test: { name: 'format-markdown', root: 'packages/format-markdown' } },
      // The sheet's CSS is imported as text; Vitest stubs CSS out unless told not to.
      { test: { name: 'render', root: 'packages/render', css: true } },
    ],
  },
})
