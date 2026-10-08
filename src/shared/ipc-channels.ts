// Plain constants only: this file is imported by the sandboxed preload, which cannot load npm packages.
/** IPC channel names. Only channels listed here may be used by the preload bridge. */
export const IPC = {
  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:is-maximized',
  winMaximizedChanged: 'win:maximized-changed',
  appGetInfo: 'app:get-info'
} as const
