import { app } from 'electron'

/** Restart the app (after a restore). The e2e harness restarts it itself, since a relaunched process isn't driven. */
export function relaunchApp(): void {
  if (!process.env['TABKING_E2E']) {
    // An AppImage's extracted mount disappears when it exits, so relaunch the .AppImage file itself.
    const appImage = process.env['APPIMAGE']
    if (appImage) app.relaunch({ execPath: appImage, args: process.argv.slice(1) })
    else app.relaunch()
  }
  app.exit(0)
}
