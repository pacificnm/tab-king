import { z } from 'zod'

export { IPC } from './ipc-channels'

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.enum(['linux', 'win32', 'darwin'])
})
export type AppInfo = z.infer<typeof AppInfoSchema>

/** API exposed to the renderer as `window.api`. */
export interface TabKingApi {
  win: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximizedChanged(cb: (maximized: boolean) => void): () => void
  }
  app: {
    getInfo(): Promise<AppInfo>
  }
}
