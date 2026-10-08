// Plain constants only: this file is imported by the sandboxed preload, which cannot load npm packages.
/** IPC channel names. Only channels listed here may be used by the preload bridge. */
export const IPC = {
  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:is-maximized',
  winMaximizedChanged: 'win:maximized-changed',
  appGetInfo: 'app:get-info',
  libListArtists: 'lib:list-artists',
  libListAlbums: 'lib:list-albums',
  libListSongs: 'lib:list-songs',
  libGetSong: 'lib:get-song',
  libPickFiles: 'lib:pick-files',
  libReadPicked: 'lib:read-picked',
  libReadId3: 'lib:read-id3',
  libAddSong: 'lib:add-song',
  libUpdateSong: 'lib:update-song',
  libDeleteSong: 'lib:delete-song',
  libRenameArtist: 'lib:rename-artist',
  libUpdateAlbum: 'lib:update-album',
  libCheckSong: 'lib:check-song',
  libChanged: 'lib:changed'
} as const
