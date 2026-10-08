import type { TabKingApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: TabKingApi
  }
}
