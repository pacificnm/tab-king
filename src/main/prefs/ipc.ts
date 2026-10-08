import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { IPC, PreferencesPatchSchema } from '@shared/ipc-contract'
import {
  BUNDLED_SOUNDFONT_URL,
  type BackupResult,
  type LibraryMoveResult,
  type LibraryPlan,
  type PreferencesView,
  type RestorePlan,
  type Result,
  type TaskProgress,
  type UpdateCheck
} from '@shared/types'
import { appVersion } from '../app-version'
import { createBackup, backupDirProblem } from '../backup/backup'
import { RestoreFailure, readArchiveInfo, restoreArchive } from '../backup/restore'
import { LATEST_SCHEMA_VERSION, MIGRATIONS, type Db } from '../db/connection'
import type { LibraryStore } from '../library/store'
import { relaunchApp } from '../relaunch'
import { checkForUpdates, RELEASES_URL } from '../update/check'
import { checkTarget, copyLibrary, ensureMarker, removeCopied, scanFiles } from './library-location'
import type { PreferencesStore } from './preferences'
import { importSoundFont } from './soundfont'

const token = z.string().min(1).max(100)

export interface PrefsIpcDeps {
  db: Db
  dbFile: string
  prefs: PreferencesStore
  store: LibraryStore
  userData: string
  /** Called after the library folder changes so the renderer reloads its lists. */
  libraryChanged(): void
}

async function wrap<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const broadcast = (channel: string, ...args: unknown[]): void => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, ...args)
}

/** Preferences (PRF-*), backup / restore (BKP-*) and the update check (ABT-2). */
export function registerPrefsIpc(deps: PrefsIpcDeps): void {
  const { db, dbFile, prefs, store, userData } = deps
  const defaultLibraryDir = join(userData, 'library')
  const defaultBackupDir = join(app.getPath('documents'), 'TabKing Backups')
  const soundfontsDir = join(userData, 'soundfonts')

  const libraryDir = (): string => store.root
  const backupDir = (): string => prefs.backupDir() ?? defaultBackupDir

  const view = (): PreferencesView => {
    const p = prefs.get()
    const custom = p.audio.soundFont
    return {
      ...p,
      soundFontUrl:
        custom && existsSync(join(soundfontsDir, custom))
          ? `tabking://soundfonts/${encodeURIComponent(custom)}`
          : BUNDLED_SOUNDFONT_URL,
      locations: {
        libraryDir: libraryDir(),
        defaultLibraryDir,
        backupDir: backupDir(),
        defaultBackupDir,
        dbPath: dbFile,
        dbSizeBytes: existsSync(dbFile) ? statSync(dbFile).size : 0
      }
    }
  }
  const changed = (): PreferencesView => {
    const v = view()
    broadcast(IPC.prefsChanged, v)
    return v
  }

  const sender = (e: IpcMainInvokeEvent): BrowserWindow => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('IPC from unknown sender')
    return win
  }

  // Backups, restores and library moves must not overlap each other.
  let busy: string | null = null
  const exclusive = async <T>(what: string, fn: () => Promise<T>): Promise<T> => {
    if (busy) throw new Error(`Please wait: ${busy} is still in progress.`)
    busy = what
    try {
      return await fn()
    } finally {
      busy = null
    }
  }
  const progressSender = (task: TaskProgress['task']) => {
    let last = 0
    return (done: number, total: number, label = ''): void => {
      const now = Date.now()
      if (now - last < 80 && done < total) return
      last = now
      broadcast(IPC.taskProgress, { task, done, total, label } satisfies TaskProgress)
    }
  }

  ipcMain.handle(IPC.prefsGet, (e) => (sender(e), view()))
  ipcMain.handle(IPC.prefsUpdate, (e, patch) =>
    wrap(() => {
      sender(e)
      prefs.update(PreferencesPatchSchema.parse(patch))
      return changed()
    })
  )

  // --- Library folder (PRF-2) ---------------------------------------------------------------------------------
  const plans = new Map<string, { path: string; mode: LibraryPlan['mode'] }>()
  let pendingCleanup: { dir: string; files: string[] } | null = null

  ipcMain.handle(IPC.prefsChooseLibraryDir, (e, useDefault) =>
    wrap(async (): Promise<LibraryPlan | null> => {
      const win = sender(e)
      let path: string
      if (useDefault === true) path = defaultLibraryDir
      else {
        const r = await dialog.showOpenDialog(win, {
          title: 'Choose the library folder',
          defaultPath: libraryDir(),
          properties: ['openDirectory', 'createDirectory']
        })
        if (r.canceled || !r.filePaths[0]) return null
        path = r.filePaths[0]
      }
      const check = checkTarget(libraryDir(), path)
      if ('error' in check) throw new Error(check.error)
      const scan = scanFiles(libraryDir())
      const t = randomUUID()
      plans.set(t, { path, mode: check.mode })
      return { token: t, path, mode: check.mode, fileCount: scan.files.length, bytes: scan.bytes }
    })
  )

  ipcMain.handle(IPC.prefsApplyLibraryDir, (e, planToken, migrate) =>
    wrap(() =>
      exclusive('moving the library', async (): Promise<LibraryMoveResult> => {
        sender(e)
        const plan = plans.get(token.parse(planToken))
        if (!plan)
          throw new Error('That folder choice has expired; please choose the folder again.')
        const doCopy = z.boolean().parse(migrate) && plan.mode === 'empty'
        const from = libraryDir()
        // The folder may have changed since it was checked (it is the user's disk, after all).
        const check = checkTarget(from, plan.path)
        if ('error' in check) throw new Error(check.error)
        const scan = scanFiles(from)
        const progress = progressSender('migrate')
        if (doCopy) {
          await copyLibrary(from, plan.path, scan.files, (n) =>
            progress(n, scan.files.length, 'Copying library files…')
          )
        } else {
          try {
            ensureMarker(plan.path)
          } catch {
            throw new Error("Tab King can't write to that folder.")
          }
        }
        store.setRoot(plan.path)
        prefs.setLibraryDir(plan.path === defaultLibraryDir ? null : plan.path)
        pendingCleanup = doCopy ? { dir: from, files: scan.files } : null
        plans.clear()
        deps.libraryChanged()
        return { view: changed(), copied: doCopy ? scan.files.length : 0, canRemoveOld: doCopy }
      })
    )
  )

  ipcMain.handle(IPC.prefsRemoveOldLibrary, (e) =>
    wrap(() => {
      sender(e)
      const job = pendingCleanup
      if (!job) throw new Error('There is nothing to remove.')
      if (job.dir === libraryDir()) throw new Error('That folder is the current library.')
      pendingCleanup = null
      return removeCopied(job.dir, job.files)
    })
  )

  // --- Backup folder -------------------------------------------------------------------------------------------
  const setBackupDir = (dir: string | null): PreferencesView => {
    if (dir) {
      const problem = backupDirProblem(dir, libraryDir())
      if (problem) throw new Error(problem)
      mkdirSync(dir, { recursive: true })
      const probe = join(dir, `.tabking-write-test-${process.pid}`)
      try {
        writeFileSync(probe, '')
      } catch {
        throw new Error("Tab King can't write to that folder.")
      } finally {
        rmSync(probe, { force: true })
      }
    }
    prefs.setBackupDir(dir)
    return changed()
  }
  ipcMain.handle(IPC.prefsChooseBackupDir, (e) =>
    wrap(async () => {
      const r = await dialog.showOpenDialog(sender(e), {
        title: 'Choose the backup folder',
        defaultPath: backupDir(),
        properties: ['openDirectory', 'createDirectory']
      })
      if (r.canceled || !r.filePaths[0]) return null
      return setBackupDir(r.filePaths[0] === defaultBackupDir ? null : r.filePaths[0])
    })
  )
  ipcMain.handle(IPC.prefsResetBackupDir, (e) => wrap(() => (sender(e), setBackupDir(null))))

  // --- SoundFont (PRF-3) -------------------------------------------------------------------------------------
  const dropCustomSoundFont = (): void => {
    const old = prefs.get().audio.soundFont
    if (old) rmSync(join(soundfontsDir, old), { force: true })
  }
  ipcMain.handle(IPC.prefsChooseSoundFont, (e) =>
    wrap(async () => {
      const r = await dialog.showOpenDialog(sender(e), {
        title: 'Choose a SoundFont',
        properties: ['openFile'],
        filters: [{ name: 'SoundFont', extensions: ['sf2', 'sf3'] }]
      })
      if (r.canceled || !r.filePaths[0]) return null
      const name = importSoundFont(r.filePaths[0], soundfontsDir)
      dropCustomSoundFont()
      prefs.setSoundFont(name)
      return changed()
    })
  )
  ipcMain.handle(IPC.prefsResetSoundFont, (e) => {
    sender(e)
    dropCustomSoundFont()
    prefs.setSoundFont(null)
    return changed()
  })

  // --- Backup and restore (BKP-1/2) ----------------------------------------------------------------------------
  ipcMain.handle(IPC.backupCreate, (e) =>
    wrap(() =>
      exclusive('a backup', async (): Promise<BackupResult> => {
        sender(e)
        const progress = progressSender('backup')
        return createBackup(
          { db, libraryRoot: libraryDir(), backupDir: backupDir(), appVersion: appVersion() },
          (done, total) => progress(done, total, 'Writing backup…')
        )
      })
    )
  )

  const archives = new Map<string, string>()
  ipcMain.handle(IPC.backupChoose, (e) =>
    wrap(async (): Promise<RestorePlan | null> => {
      const r = await dialog.showOpenDialog(sender(e), {
        title: 'Choose a Tab King backup',
        defaultPath: existsSync(backupDir()) ? backupDir() : undefined,
        properties: ['openFile'],
        filters: [{ name: 'Tab King backup', extensions: ['zip'] }]
      })
      const file = r.filePaths[0]
      if (r.canceled || !file) return null
      const info = await readArchiveInfo(file, LATEST_SCHEMA_VERSION)
      const t = randomUUID()
      archives.set(t, file)
      return { token: t, fileName: basename(file), ...info }
    })
  )

  ipcMain.handle(IPC.backupRestore, (e, archiveToken) =>
    wrap(() =>
      exclusive('a restore', async () => {
        sender(e)
        const zipPath = archives.get(token.parse(archiveToken))
        if (!zipPath)
          throw new Error('That backup choice has expired; please choose the file again.')
        const progress = progressSender('restore')
        try {
          await restoreArchive({
            zipPath,
            dbFile,
            libraryRoot: libraryDir(),
            migrations: MIGRATIONS,
            closeDb: () => db.close(),
            onProgress: (done, total, label) => progress(done, total, label)
          })
        } catch (err) {
          // Once the database is closed the app can't carry on; restart whatever the outcome.
          if (err instanceof RestoreFailure && err.dbClosed) setTimeout(relaunchApp, 2500)
          throw err
        }
        archives.clear()
        setTimeout(relaunchApp, 400)
        return null
      })
    )
  )

  // --- Update check (ABT-2): only ever runs because the user clicked the button ------------------------------
  ipcMain.handle(IPC.updateCheck, (e) =>
    wrap(async (): Promise<UpdateCheck> => {
      sender(e)
      // The e2e harness points this at a local stand-in for GitHub.
      const url = (process.env['TABKING_E2E'] && process.env['TABKING_UPDATE_URL']) || RELEASES_URL
      return checkForUpdates(appVersion(), (u, init) => fetch(u, init), url)
    })
  )
}
