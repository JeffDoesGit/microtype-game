import { defineConfig } from 'vite'

// GitHub Pages serves project sites from /<repo-name>/, so `base` MUST match the
// repo name or every asset path 404s (DESIGN.md §1). The deploy workflow passes
// BASE_PATH from the repository name, so a rename can't silently break the build.
// The fallback is for local `vite build` runs outside CI.
const base = process.env.BASE_PATH ?? '/microtype-game/'

export default defineConfig({
  base,
})
