// Prints the path of the unpacked app that `electron-builder --dir` (or a full build) leaves in release/.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'release'
const found = []
if (process.platform === 'win32') found.push(join(dir, 'win-unpacked', 'Tab King.exe'))
else if (process.platform === 'darwin') {
  for (const d of readdirSync(dir)) {
    if (d === 'mac' || d.startsWith('mac-'))
      found.push(join(dir, d, 'Tab King.app', 'Contents', 'MacOS', 'Tab King'))
  }
} else
  found.push(join(dir, 'linux-unpacked', 'tab-king'), join(dir, 'linux-arm64-unpacked', 'tab-king'))
const exe = found.find(existsSync)
if (!exe) {
  console.error(`No unpacked app found in ${dir}/ (looked for: ${found.join(', ')})`)
  process.exit(1)
}
console.log(exe)
