import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve(process.argv[2] || 'release')
const maximumBytes = 100_000_000
const packageExtensions = new Set(['.exe', '.dmg', '.zip'])
const installerExtensions = new Set(['.exe', '.dmg'])
const { version } = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
const files = (await readdir(directory)).filter((name) => name.includes(`-${version}-`) && packageExtensions.has(path.extname(name)))

if (files.length === 0) throw new Error(`No release packages found in ${directory}`)

let failed = false
for (const name of files) {
  const { size } = await stat(path.join(directory, name))
  const megabytes = (size / 1_000_000).toFixed(2)
  console.log(`${name}: ${megabytes} MB`)
  if (installerExtensions.has(path.extname(name)) && size >= maximumBytes) {
    console.error(`${name} exceeds the Gitee 100 MB attachment limit`)
    failed = true
  } else if (path.extname(name) === '.zip' && size >= maximumBytes) {
    console.log(`${name} is a GitHub-only update archive and will not be uploaded to Gitee`)
  }
}

if (failed) process.exit(1)
