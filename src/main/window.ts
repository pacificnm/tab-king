import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc-contract'
import type { SettingsStore } from './settings-store'
import { MIN_HEIGHT, MIN_WIDTH, sanitizeWindowState, type WindowState } from './window-state'

const STATE_KEY = 'windowState'

export function createMainWindow(settings: SettingsStore): BrowserWindow {
  const displays = screen.getAllDisplays().map((d) => d.workArea)
  const state = sanitizeWindowState(settings.get(STATE_KEY), displays)

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    frame: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Lets the end-to-end tests ask the renderer for timing diagnostics; off for normal launches.
      additionalArguments: process.env['TABKING_E2E'] ? ['--tabking-e2e'] : []
    }
  })

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  let timer: NodeJS.Timeout | undefined
  const save = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed()) return
      const prev = sanitizeWindowState(settings.get(STATE_KEY), displays)
      const maximized = win.isMaximized()
      // While maximized keep the last normal bounds so restore works next launch.
      const b = maximized ? prev : win.getBounds()
      const next: WindowState = { ...b, maximized }
      settings.set(STATE_KEY, next)
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', () => {
    win.webContents.send(IPC.winMaximizedChanged, true)
    save()
  })
  win.on('unmaximize', () => {
    win.webContents.send(IPC.winMaximizedChanged, false)
    save()
  })
  win.on('close', () => {
    clearTimeout(timer)
    const maximized = win.isMaximized()
    const b = maximized ? sanitizeWindowState(settings.get(STATE_KEY), displays) : win.getBounds()
    settings.set(STATE_KEY, { ...b, maximized })
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
