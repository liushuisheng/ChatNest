import { readdir, readFile } from 'node:fs/promises'
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

async function api(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const message = (await response.text()).slice(0, 1000)
    throw new Error(`Gitee API ${response.status}: ${message}`)
  }
  return response.status === 204 ? null : response.json()
}

async function findOrCreateRelease() {
  const response = await fetch(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`)
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
const files = (await readdir(assetDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort()

if (files.length === 0) throw new Error(`No release assets found in ${assetDirectory}`)

for (const name of files) {
  if (existingNames.has(name)) {
    console.log(`Skipping existing Gitee asset: ${name}`)
    continue
  }
  const bytes = await readFile(path.join(assetDirectory, name))
  const form = new FormData()
  form.append('access_token', token)
  form.append('file', new Blob([bytes]), name)
  console.log(`Uploading Gitee asset: ${name}`)
  await api(`${apiBase}/releases/${release.id}/attach_files`, { method: 'POST', body: form })
}

console.log(`Gitee release is ready: https://gitee.com/${owner}/${repo}/releases/tag/${tag}`)
