import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve(process.argv[2] || 'release')
const maximumBytes = 100_000_000
const extensions = new Set(['.exe', '.dmg', '.zip'])
const { version } = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
const files = (await readdir(directory)).filter((name) => name.includes(`-${version}-`) && extensions.has(path.extname(name)))

if (files.length === 0) throw new Error(`No release packages found in ${directory}`)

let failed = false
for (const name of files) {
  const { size } = await stat(path.join(directory, name))
  const megabytes = (size / 1_000_000).toFixed(2)
  console.log(`${name}: ${megabytes} MB`)
  if (size >= maximumBytes) {
    console.error(`${name} exceeds the Gitee 100 MB attachment limit`)
    failed = true
  }
}

if (failed) process.exit(1)
