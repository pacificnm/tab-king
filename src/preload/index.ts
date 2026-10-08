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
  },
  library: {
    listArtists: () => ipcRenderer.invoke(IPC.libListArtists),
    listAlbums: (artistId) => ipcRenderer.invoke(IPC.libListAlbums, artistId),
    listSongs: (artistId, albumId) => ipcRenderer.invoke(IPC.libListSongs, artistId, albumId),
    getSong: (id) => ipcRenderer.invoke(IPC.libGetSong, id),
    pickFiles: (kind) => ipcRenderer.invoke(IPC.libPickFiles, kind),
    readPicked: (token) => ipcRenderer.invoke(IPC.libReadPicked, token),
    readId3: (token) => ipcRenderer.invoke(IPC.libReadId3, token),
    addSong: (form) => ipcRenderer.invoke(IPC.libAddSong, form),
    updateSong: (id, form) => ipcRenderer.invoke(IPC.libUpdateSong, id, form),
    deleteSong: (id, deleteFiles) => ipcRenderer.invoke(IPC.libDeleteSong, id, deleteFiles),
    renameArtist: (id, name) => ipcRenderer.invoke(IPC.libRenameArtist, id, name),
    updateAlbum: (id, title, year) => ipcRenderer.invoke(IPC.libUpdateAlbum, id, title, year),
    saveMix: (songId, mix) => ipcRenderer.invoke(IPC.libSaveMix, songId, mix),
    checkSong: (id) => ipcRenderer.invoke(IPC.libCheckSong, id),
    onChanged: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.libChanged, listener)
      return () => ipcRenderer.removeListener(IPC.libChanged, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
