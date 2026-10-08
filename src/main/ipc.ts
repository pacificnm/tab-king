import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { AppInfoSchema, IPC } from '@shared/ipc-contract'
import { appVersion } from './app-version'

/** Resolve the window that sent the message; reject senders that aren't one of our windows. */
function senderWindow(e: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) throw new Error('IPC from unknown sender')
  return win
}

export function registerIpc(): void {
  ipcMain.handle(IPC.winMinimize, (e) => senderWindow(e).minimize())
  ipcMain.handle(IPC.winToggleMaximize, (e) => {
    const win = senderWindow(e)
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(IPC.winClose, (e) => senderWindow(e).close())
  ipcMain.handle(IPC.winIsMaximized, (e) => senderWindow(e).isMaximized())
  ipcMain.handle(IPC.appGetInfo, (e) => {
    senderWindow(e)
    const platform = process.platform
    return AppInfoSchema.parse({
      name: app.getName(),
      version: appVersion(),
      platform: platform === 'win32' || platform === 'darwin' ? platform : 'linux'
    })
  })
}
