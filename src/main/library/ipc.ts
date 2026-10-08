import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { IPC, SongFormSchema } from '@shared/ipc-contract'
import type { Id3Info, PickKind, Result } from '@shared/types'
import type { LibraryRepo } from '../db/repo/library-repo'
import { readId3 } from './id3'
import type { PickedFiles } from './picked-files'
import type { SongService } from './song-service'

const id = z.number().int().positive()
const name = z.string().trim().min(1).max(300)
const PickKindSchema = z.enum(['gp', 'midi', 'mp3'])

const PICKERS: Record<PickKind, { title: string; filters: Electron.FileFilter[] }> = {
  gp: {
    title: 'Choose a Guitar Pro file',
    filters: [{ name: 'Guitar Pro', extensions: ['gp', 'gp3', 'gp4', 'gp5', 'gpx'] }]
  },
  midi: {
    title: 'Choose a MIDI file',
    filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }]
  },
  mp3: {
    title: 'Choose an MP3 file',
    filters: [{ name: 'MP3 audio', extensions: ['mp3'] }]
  }
}

async function wrap<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface LibraryIpcDeps {
  repo: LibraryRepo
  service: SongService
  picked: PickedFiles
}

export function registerLibraryIpc({ repo, service, picked }: LibraryIpcDeps): void {
  const sender = (e: IpcMainInvokeEvent): BrowserWindow => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('IPC from unknown sender')
    return win
  }
  const changed = (): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.libChanged)
  }

  ipcMain.handle(IPC.libListArtists, (e) => (sender(e), repo.listArtists()))
  ipcMain.handle(
    IPC.libListAlbums,
    (e, artistId) => (sender(e), repo.listAlbums(id.parse(artistId)))
  )
  ipcMain.handle(
    IPC.libListSongs,
    (e, artistId, albumId) => (
      sender(e),
      repo.listSongs(id.parse(artistId), id.nullable().parse(albumId))
    )
  )
  ipcMain.handle(IPC.libGetSong, (e, songId) => (sender(e), repo.getSong(id.parse(songId)) ?? null))
  ipcMain.handle(IPC.libCheckSong, (e, songId) => (sender(e), service.check(id.parse(songId))))

  ipcMain.handle(IPC.libPickFiles, async (e, kind) => {
    const win = sender(e)
    const p = PICKERS[PickKindSchema.parse(kind)]
    const res = await dialog.showOpenDialog(win, {
      title: p.title,
      filters: [...p.filters, { name: 'All files', extensions: ['*'] }],
      properties: ['openFile']
    })
    return res.canceled ? [] : res.filePaths.map((f) => picked.add(f))
  })

  ipcMain.handle(IPC.libReadPicked, (e, token) =>
    wrap(async () => {
      sender(e)
      const buf = await readFile(picked.resolve(z.string().parse(token)))
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    })
  )

  ipcMain.handle(IPC.libReadId3, (e, token) =>
    wrap(async (): Promise<Id3Info> => {
      sender(e)
      const { info, cover } = await readId3(picked.resolve(z.string().parse(token)))
      const coverDataUrl = cover
        ? `data:${cover.mime};base64,${Buffer.from(cover.data).toString('base64')}`
        : null
      return { ...info, coverDataUrl }
    })
  )

  ipcMain.handle(IPC.libAddSong, (e, form) =>
    wrap(async () => {
      sender(e)
      const song = await service.addSong(SongFormSchema.parse(form))
      changed()
      return song
    })
  )
  ipcMain.handle(IPC.libUpdateSong, (e, songId, form) =>
    wrap(async () => {
      sender(e)
      const song = await service.updateSong(id.parse(songId), SongFormSchema.parse(form))
      changed()
      return song
    })
  )
  ipcMain.handle(IPC.libDeleteSong, (e, songId, deleteFiles) =>
    wrap(() => {
      sender(e)
      service.deleteSong(id.parse(songId), z.boolean().parse(deleteFiles))
      changed()
      return null
    })
  )
  ipcMain.handle(IPC.libRenameArtist, (e, artistId, newName) =>
    wrap(() => {
      sender(e)
      repo.renameArtist(id.parse(artistId), name.parse(newName))
      changed()
      return null
    })
  )
  ipcMain.handle(IPC.libUpdateAlbum, (e, albumId, title, year) =>
    wrap(() => {
      sender(e)
      repo.updateAlbum(
        id.parse(albumId),
        name.parse(title),
        z.number().int().min(0).max(9999).nullable().parse(year)
      )
      changed()
      return null
    })
  )
}
