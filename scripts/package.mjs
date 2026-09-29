import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const targets = {
  'darwin:arm64': 'darwin-arm64',
  'darwin:x64': 'darwin-x64',
  'linux:arm64': 'linux-arm64',
  'linux:x64': 'linux-x64',
  'win32:arm64': 'win32-arm64',
  'win32:x64': 'win32-x64',
}

const target = targets[`${process.platform}:${process.arch}`]
if (!target) {
  throw new Error(`Unsupported packaging platform: ${process.platform}-${process.arch}`)
}

const require = createRequire(import.meta.url)
const vscePackagePath = require.resolve('@vscode/vsce/package.json')
const vscePath = path.join(path.dirname(vscePackagePath), 'vsce')
const result = spawnSync(
  process.execPath,
  [
    vscePath,
    'package',
    '--target',
    target,
    '--out',
    `dist/tailwind-class-highlighting-${target}.vsix`,
  ],
  { stdio: 'inherit' },
)

if (result.error) {
  throw result.error
}
process.exit(result.status ?? 1)
