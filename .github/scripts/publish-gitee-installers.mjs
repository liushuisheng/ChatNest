import { readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const token = process.env.GITEE_TOKEN
const owner = process.env.GITEE_OWNER || 'liushuisheng'
const repo = process.env.GITEE_REPO || 'ChatNest'
const tag = process.env.RELEASE_TAG
const target = process.env.TARGET_COMMITISH || tag
const assetDirectory = path.resolve(process.argv[2] || 'assets')
const apiBase = `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!token) throw new Error('GITEE_TOKEN is required')
if (!tag) throw new Error('RELEASE_TAG is required')

async function request(url, options = {}) {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await fetch(url, options)
    } catch (error) {
      lastError = error
      if (attempt < 5) {
        console.warn(`Gitee connection failed; retrying (${attempt}/5)`)
        await delay(attempt * 5000)
      }
    }
  }
  throw lastError
}

async function api(url, options = {}) {
  const response = await request(url, options)
  if (!response.ok) {
    const message = (await response.text()).slice(0, 1000)
    throw new Error(`Gitee API ${response.status}: ${message}`)
  }
  return response.status === 204 ? null : response.json()
}

async function findOrCreateRelease() {
  const response = await request(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`)
  if (response.ok) {
    const release = await response.json()
    if (release?.id) return release
  } else if (response.status !== 404) {
    throw new Error(`Unable to query Gitee release: ${response.status}`)
  }

  const body = new URLSearchParams({
    access_token: token,
    tag_name: tag,
    name: `ChatNest ${tag}`,
    body: `ChatNest ${tag}`,
    prerelease: String(tag.includes('-')),
    target_commitish: target,
  })
  return api(`${apiBase}/releases`, { method: 'POST', body })
}

function uploadFile(releaseId, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', [
      '--fail-with-body', '--silent', '--show-error',
      '--connect-timeout', '30', '--max-time', '1800',
      '--request', 'POST',
      '--form', `access_token=${token}`,
      '--form', `file=@${filePath}`,
      `${apiBase}/releases/${releaseId}/attach_files`,
    ])
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Gitee attachment upload failed (${code}): ${output.slice(-1000)}`))
    })
  })
}

const release = await findOrCreateRelease()
const existing = await api(`${apiBase}/releases/${release.id}/attach_files`)
const existingNames = new Set(existing.map((item) => item.name))
const entries = (await readdir(assetDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && ['.exe', '.dmg'].includes(path.extname(entry.name)))
const installers = await Promise.all(entries.map(async (entry) => ({
  name: entry.name,
  size: (await stat(path.join(assetDirectory, entry.name))).size,
})))

if (installers.length !== 4) throw new Error(`Expected 4 Gitee installers, found ${installers.length}`)

for (const { name, size } of installers.sort((left, right) => left.size - right.size)) {
  if (size >= 100_000_000) throw new Error(`${name} exceeds Gitee's 100 MB attachment limit`)
  if (existingNames.has(name)) {
    console.log(`Skipping existing Gitee installer: ${name}`)
    continue
  }
  console.log(`Uploading Gitee installer: ${name} (${(size / 1_000_000).toFixed(2)} MB)`)
  await uploadFile(release.id, path.join(assetDirectory, name))
}

let indexed = false
for (let attempt = 1; attempt <= 24; attempt += 1) {
  const attachments = await api(`${apiBase}/releases/${release.id}/attach_files`)
  const byName = new Map(attachments.map((item) => [item.name, item]))
  indexed = installers.every(({ name, size }) => Number(byName.get(name)?.size) === size)
  if (indexed) break
  console.log(`Waiting for Gitee to index all installers (${attempt}/24)`)
  await delay(5000)
}

if (!indexed) throw new Error('Gitee did not expose all 4 installers after upload')

console.log(`Gitee release is ready: https://gitee.com/${owner}/${repo}/releases/tag/${tag}`)
