// Verifies that a packaging run produced every installer it should, with the documented names (SPECS §11.1).
// usage: node scripts/check-artifacts.mjs <linux|win|mac> <x64|arm64>
import { readdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'

const [os, arch] = process.argv.slice(2)
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const p = `tab-king-${version}`
const EXPECT = {
  'linux x64': [`${p}-linux-x86_64.AppImage`, `${p}-linux-amd64.deb`],
  'linux arm64': [`${p}-linux-arm64.AppImage`, `${p}-linux-arm64.deb`],
  'win x64': [`${p}-win-x64.exe`, `${p}-win-x64-portable.exe`],
  'mac x64': [`${p}-mac-x64.dmg`, `${p}-mac-x64.zip`],
  'mac arm64': [`${p}-mac-arm64.dmg`, `${p}-mac-arm64.zip`]
}
const want = EXPECT[`${os} ${arch}`]
if (!want) {
  console.error(`unknown target "${os} ${arch}"`)
  process.exit(2)
}
const have = new Set(readdirSync('release'))
const missing = want.filter((f) => !have.has(f))
if (missing.length) {
  console.error(
    `Missing artifacts:\n  ${missing.join('\n  ')}\nFound:\n  ${[...have].join('\n  ')}`
  )
  process.exit(1)
}
console.log(`ok: ${want.join(', ')}`)
