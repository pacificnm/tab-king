import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { openDatabase } from './db/connection'
import { LibraryRepo } from './db/repo/library-repo'
import { PlaylistRepo } from './db/repo/playlist-repo'
import { SearchRepo } from './db/repo/search-repo'
import { IPC } from '@shared/ipc-contract'
import { registerIpc } from './ipc'
import { registerLibraryIpc } from './library/ipc'
import { PickedFiles } from './library/picked-files'
import { registerLibraryProtocol, registerScheme } from './library/protocol'
import { SongService } from './library/song-service'
import { LibraryStore } from './library/store'
import { denyPermissions, installCsp, lockDownWebContents } from './security'
import { SettingsStore } from './settings-store'
import { ensureMarker } from './prefs/library-location'
import { registerPrefsIpc } from './prefs/ipc'
import { PreferencesStore } from './prefs/preferences'
import { createMainWindow } from './window'

/** The configured library folder, or the default if it can't be used (say, an unplugged drive). */
function openLibraryStore(prefs: PreferencesStore, fallback: string): LibraryStore {
  const chosen = prefs.libraryDir()
  let store: LibraryStore
  try {
    store = new LibraryStore(chosen ?? fallback)
  } catch (e) {
    console.error(`Library folder ${chosen} is unavailable; using ${fallback}`, e)
    store = new LibraryStore(fallback)
  }
  ensureMarker(store.root) // marks the folder as ours, so later moves and restores know it is safe to manage
  return store
}

app.setName('Tab King')
registerScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  lockDownWebContents()

  app.whenReady().then(() => {
    installCsp(is.dev)
    denyPermissions()
    registerIpc()
    const userData = app.getPath('userData')
    const settings = new SettingsStore()
    const prefs = new PreferencesStore(settings)
    const dbFile = join(userData, 'library.db')
    const db = openDatabase(dbFile)
    const repo = new LibraryRepo(db)
    const store = openLibraryStore(prefs, join(userData, 'library'))
    const picked = new PickedFiles()
    // out/main/index.js -> ../../resources (same layout in dev, e2e and inside app.asar)
    registerLibraryProtocol(store, join(__dirname, '../../resources'), join(userData, 'soundfonts'))
    registerLibraryIpc({
      repo,
      searchRepo: new SearchRepo(db, repo),
      playlists: new PlaylistRepo(db, repo),
      service: new SongService(repo, store, picked),
      picked
    })
    registerPrefsIpc({
      db,
      dbFile,
      prefs,
      store,
      userData,
      libraryChanged: () => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.libChanged)
      }
    })
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
