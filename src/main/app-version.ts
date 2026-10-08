import { app } from 'electron'

declare const __APP_VERSION__: string

/** The version from package.json, baked in at build time (the same number electron-builder packages). */
export const appVersion = (): string =>
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : app.getVersion()
