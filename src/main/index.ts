import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { openDatabase } from './db/connection'
import { LibraryRepo } from './db/repo/library-repo'
import { PlaylistRepo } from './db/repo/playlist-repo'
import { SearchRepo } from './db/repo/search-repo'
import { registerIpc } from './ipc'
import { registerLibraryIpc } from './library/ipc'
import { PickedFiles } from './library/picked-files'
import { registerLibraryProtocol, registerScheme } from './library/protocol'
import { SongService } from './library/song-service'
import { LibraryStore } from './library/store'
import { denyPermissions, installCsp, lockDownWebContents } from './security'
import { SettingsStore } from './settings-store'
import { createMainWindow } from './window'

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
    const db = openDatabase(join(app.getPath('userData'), 'library.db'))
    const repo = new LibraryRepo(db)
    const store = new LibraryStore(join(app.getPath('userData'), 'library'))
    const picked = new PickedFiles()
    // out/main/index.js -> ../../resources (same layout in dev, e2e and inside app.asar)
    registerLibraryProtocol(store, join(__dirname, '../../resources'))
    registerLibraryIpc({
      repo,
      searchRepo: new SearchRepo(db, repo),
      playlists: new PlaylistRepo(db, repo),
      service: new SongService(repo, store, picked),
      picked
    })
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
