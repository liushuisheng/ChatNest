import { readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const token = process.env.GITEE_TOKEN
const owner = process.env.GITEE_OWNER || 'liushuisheng'
const repo = process.env.GITEE_REPO || 'ChatNest'
const tag = process.env.RELEASE_TAG
const target = process.env.TARGET_COMMITISH || 'main'
const assetDirectory = path.resolve(process.argv[2] || 'assets')
const apiBase = `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

if (!token) throw new Error('GITEE_TOKEN is required')
if (!tag) throw new Error('RELEASE_TAG is required')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    const existingRelease = await response.json()
    if (existingRelease?.id) return existingRelease
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

const release = await findOrCreateRelease()
const existing = await api(`${apiBase}/releases/${release.id}/attach_files`)
const existingNames = new Set(existing.map((item) => item.name))
const entries = (await readdir(assetDirectory, { withFileTypes: true })).filter((entry) => entry.isFile())
const files = await Promise.all(entries.map(async (entry) => ({
  name: entry.name,
  size: (await stat(path.join(assetDirectory, entry.name))).size,
})))
files.sort((left, right) => left.size - right.size || left.name.localeCompare(right.name))

if (files.length === 0) throw new Error(`No release assets found in ${assetDirectory}`)

function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', [
      '--fail-with-body', '--silent', '--show-error',
      '--connect-timeout', '30', '--max-time', '1800',
      '--request', 'POST',
      '--form', `access_token=${token}`,
      '--form', `file=@${filePath}`,
      `${apiBase}/releases/${release.id}/attach_files`,
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

for (const { name, size } of files) {
  if (existingNames.has(name)) {
    console.log(`Skipping existing Gitee asset: ${name}`)
    continue
  }
  console.log(`Uploading Gitee asset: ${name} (${Math.ceil(size / 1024 / 1024)} MB)`)
  await uploadFile(path.join(assetDirectory, name))
}

console.log(`Gitee release is ready: https://gitee.com/${owner}/${repo}/releases/tag/${tag}`)
