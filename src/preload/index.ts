import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { TabKingApi } from '@shared/ipc-contract'

const api: TabKingApi = {
  win: {
    minimize: () => ipcRenderer.invoke(IPC.winMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC.winToggleMaximize),
    close: () => ipcRenderer.invoke(IPC.winClose),
    isMaximized: () => ipcRenderer.invoke(IPC.winIsMaximized),
    onMaximizedChanged: (cb) => {
      const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
      ipcRenderer.on(IPC.winMaximizedChanged, listener)
      return () => ipcRenderer.removeListener(IPC.winMaximizedChanged, listener)
    }
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo)
  }
}

contextBridge.exposeInMainWorld('api', api)
