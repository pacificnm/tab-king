import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { alphaTab } from '@coderline/alphatab-vite'

const shared = resolve('src/shared')
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // `electron out/main/index.js` (the e2e harness) has no package.json beside it, so app.getVersion() can't be trusted.
    define: { __APP_VERSION__: JSON.stringify(version) },
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    plugins: [
      react(),
      tailwindcss(), // Fonts and the SoundFont are served from resources/ via tabking://app, so skip the plugin's asset copying.
      alphaTab({ assetOutputDir: false })
    ],
    // alphaTab detects Vite through this global; without it workers/worklets can't be located.
    define: { __BASE__: JSON.stringify('./') },
    resolve: { alias: { '@shared': shared, '@': resolve('src/renderer/src') } }
  }
})
