import { app, session, shell, type WebContents } from 'electron'

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: tabking:",
  "media-src 'self' blob: tabking:",
  "font-src 'self' data: tabking:",
  "connect-src 'self' tabking:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ')

// Vite dev server needs inline scripts (React refresh) and websockets (HMR).
const DEV_CSP = PROD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:*"
)

export function installCsp(isDev: boolean): void {
  const csp = isDev ? DEV_CSP : PROD_CSP
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] }
    })
  })
}

/** Deny navigation, new windows and webviews; open http(s) links in the system browser. */
export function lockDownWebContents(): void {
  app.on('web-contents-created', (_e, contents: WebContents) => {
    contents.on('will-navigate', (e, url) => {
      if (url !== contents.getURL()) e.preventDefault()
    })
    contents.on('will-attach-webview', (e) => e.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

/** Deny all permission requests (camera, mic, geolocation...). Call after app is ready. */
export function denyPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
}
