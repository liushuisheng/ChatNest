import { readFile, readdir, stat } from 'node:fs/promises'
import { appendFile } from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve(process.argv[2] || 'release')
const maximumBytes = 100_000_000
const packageExtensions = new Set(['.exe', '.dmg', '.zip'])
const installerExtensions = new Set(['.exe', '.dmg'])
const { version } = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
const files = (await readdir(directory)).filter((name) => name.includes(`-${version}-`) && packageExtensions.has(path.extname(name)))

if (files.length === 0) throw new Error(`No release packages found in ${directory}`)

let giteeEligible = true
const warnings = []
for (const name of files) {
  const { size } = await stat(path.join(directory, name))
  const megabytes = (size / 1_000_000).toFixed(2)
  console.log(`${name}: ${megabytes} MB`)
  if (installerExtensions.has(path.extname(name)) && size >= maximumBytes) {
    const warning = `${name} is ${megabytes} MB and exceeds Gitee's 100 MB attachment limit; this release will not sync to Gitee.`
    console.log(`::warning title=Gitee sync skipped::${warning}`)
    warnings.push(warning)
    giteeEligible = false
  } else if (path.extname(name) === '.zip' && size >= maximumBytes) {
    const warning = `${name} is ${megabytes} MB; it is a GitHub-only update archive and will not be uploaded to Gitee.`
    console.log(`::warning title=Large update archive::${warning}`)
    warnings.push(warning)
  }
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `eligible=${giteeEligible}\n`)
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const result = giteeEligible ? 'Eligible for Gitee installer sync' : 'Gitee installer sync will be skipped'
  const details = warnings.length ? warnings.map((warning) => `- ⚠️ ${warning}`).join('\n') : '- All installer files are below 100 MB.'
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Release size check\n\n**${result}**\n\n${details}\n`)
}

console.log(`Gitee installer sync eligible: ${giteeEligible}`)
