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
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
    diagnostics: process.argv.includes('--tabking-e2e'),
    onProgress: (cb) => {
      const listener = (_e: unknown, p: Parameters<typeof cb>[0]): void => cb(p)
      ipcRenderer.on(IPC.taskProgress, listener)
      return () => ipcRenderer.removeListener(IPC.taskProgress, listener)
    },
    checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck)
  },
  prefs: {
    get: () => ipcRenderer.invoke(IPC.prefsGet),
    update: (patch) => ipcRenderer.invoke(IPC.prefsUpdate, patch),
    onChanged: (cb) => {
      const listener = (_e: unknown, view: Parameters<typeof cb>[0]): void => cb(view)
      ipcRenderer.on(IPC.prefsChanged, listener)
      return () => ipcRenderer.removeListener(IPC.prefsChanged, listener)
    },
    chooseLibraryDir: (useDefault) => ipcRenderer.invoke(IPC.prefsChooseLibraryDir, useDefault),
    applyLibraryDir: (token, migrate) =>
      ipcRenderer.invoke(IPC.prefsApplyLibraryDir, token, migrate),
    removeOldLibrary: () => ipcRenderer.invoke(IPC.prefsRemoveOldLibrary),
    chooseBackupDir: () => ipcRenderer.invoke(IPC.prefsChooseBackupDir),
    resetBackupDir: () => ipcRenderer.invoke(IPC.prefsResetBackupDir),
    chooseSoundFont: () => ipcRenderer.invoke(IPC.prefsChooseSoundFont),
    resetSoundFont: () => ipcRenderer.invoke(IPC.prefsResetSoundFont)
  },
  backup: {
    create: () => ipcRenderer.invoke(IPC.backupCreate),
    choose: () => ipcRenderer.invoke(IPC.backupChoose),
    restore: (token) => ipcRenderer.invoke(IPC.backupRestore, token)
  },
  library: {
    listArtists: () => ipcRenderer.invoke(IPC.libListArtists),
    listAlbums: (artistId) => ipcRenderer.invoke(IPC.libListAlbums, artistId),
    listSongs: (artistId, albumId) => ipcRenderer.invoke(IPC.libListSongs, artistId, albumId),
    getSong: (id) => ipcRenderer.invoke(IPC.libGetSong, id),
    listSongsByArtist: (artistId) => ipcRenderer.invoke(IPC.libListSongsByArtist, artistId),
    search: (text) => ipcRenderer.invoke(IPC.libSearch, text),
    listFavorites: () => ipcRenderer.invoke(IPC.libListFavorites),
    setFavorite: (songId, favorite) => ipcRenderer.invoke(IPC.libSetFavorite, songId, favorite),
    playlists: {
      list: () => ipcRenderer.invoke(IPC.libPlaylistList),
      create: (name) => ipcRenderer.invoke(IPC.libPlaylistCreate, name),
      rename: (id, name) => ipcRenderer.invoke(IPC.libPlaylistRename, id, name),
      delete: (id) => ipcRenderer.invoke(IPC.libPlaylistDelete, id),
      songs: (id) => ipcRenderer.invoke(IPC.libPlaylistSongs, id),
      add: (id, songIds) => ipcRenderer.invoke(IPC.libPlaylistAdd, id, songIds),
      remove: (id, songId) => ipcRenderer.invoke(IPC.libPlaylistRemove, id, songId),
      reorder: (id, songIds) => ipcRenderer.invoke(IPC.libPlaylistReorder, id, songIds)
    },
    pickFiles: (kind) => ipcRenderer.invoke(IPC.libPickFiles, kind),
    readPicked: (token) => ipcRenderer.invoke(IPC.libReadPicked, token),
    readId3: (token) => ipcRenderer.invoke(IPC.libReadId3, token),
    addSong: (form) => ipcRenderer.invoke(IPC.libAddSong, form),
    updateSong: (id, form) => ipcRenderer.invoke(IPC.libUpdateSong, id, form),
    deleteSong: (id, deleteFiles) => ipcRenderer.invoke(IPC.libDeleteSong, id, deleteFiles),
    renameArtist: (id, name) => ipcRenderer.invoke(IPC.libRenameArtist, id, name),
    updateAlbum: (id, title, year) => ipcRenderer.invoke(IPC.libUpdateAlbum, id, title, year),
    saveMix: (songId, mix) => ipcRenderer.invoke(IPC.libSaveMix, songId, mix),
    saveSync: (songId, sync) => ipcRenderer.invoke(IPC.libSaveSync, songId, sync),
    checkSong: (id) => ipcRenderer.invoke(IPC.libCheckSong, id),
    onChanged: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.libChanged, listener)
      return () => ipcRenderer.removeListener(IPC.libChanged, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
