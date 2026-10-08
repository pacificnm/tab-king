import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { openDatabase } from './db/connection'
import { registerIpc } from './ipc'
import { denyPermissions, installCsp, lockDownWebContents } from './security'
import { SettingsStore } from './settings-store'
import { createMainWindow } from './window'

app.setName('Tab King')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  lockDownWebContents()

  app.whenReady().then(() => {
    installCsp(is.dev)
    denyPermissions()
    registerIpc()
    openDatabase(join(app.getPath('userData'), 'library.db'))
    const settings = new SettingsStore()
    createMainWindow(settings)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(settings)
    })
  })

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
