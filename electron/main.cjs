const { app, BrowserWindow, dialog, ipcMain, shell, Menu, Tray, nativeImage } = require('electron')
const { autoUpdater } = require('electron-updater')
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

let mainWindow
let tray
let updatePreparation
let updateReadyVersion = ''

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.channel = process.arch === 'arm64' ? 'latest-arm64' : 'latest'
autoUpdater.allowDowngrade = false
autoUpdater.on('error', (error) => console.error('Auto update error:', error.message))

const exec = (file, args = [], options = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, timeout: 8000, ...options }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stderr }))
    else resolve(String(stdout || '').trim())
  })
})

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')
const macAppInfoCache = new Map()

function macLog(event, details = {}) {
  if (process.platform !== 'darwin') return
  try {
    const logPath = path.join(app.getPath('userData'), 'logs', 'mac-runtime.log')
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), version: app.getVersion(), event, ...details })}\n`)
  } catch {}
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) } catch { return {} }
}

function writeSettings(value) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(value, null, 2))
}

function candidates() {
  if (process.platform === 'darwin') {
    return ['/Applications/WeChat.app', '/Applications/Weixin.app', path.join(app.getPath('home'), 'Applications/WeChat.app')]
  }
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)
  return roots.flatMap((root) => [
    path.join(root, 'Tencent', 'WeChat', 'WeChat.exe'),
    path.join(root, 'Tencent', 'Weixin', 'Weixin.exe'),
    path.join(root, 'WeChat', 'WeChat.exe'),
  ])
}

function resolveExecutable() {
  const configured = readSettings().executablePath
  if (configured && fs.existsSync(configured)) return { path: configured, source: 'custom' }
  const detected = candidates().find((item) => fs.existsSync(item))
  return detected ? { path: detected, source: 'auto' } : { path: '', source: 'missing' }
}

async function macAppInfo(appPath) {
  if (macAppInfoCache.has(appPath)) return macAppInfoCache.get(appPath)
  const readPlistValue = async (key) => {
    try {
      return await exec('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(appPath, 'Contents', 'Info.plist')])
    } catch { return '' }
  }
  const executableName = await readPlistValue('CFBundleExecutable') || path.basename(appPath, '.app')
  const info = {
    executableName,
    executablePath: path.join(appPath, 'Contents', 'MacOS', executableName),
    bundleId: await readPlistValue('CFBundleIdentifier'),
  }
  macAppInfoCache.set(appPath, info)
  return info
}

async function macProcessIds(appPath = resolveExecutable().path) {
  const names = new Set(['WeChat', 'Weixin'])
  if (appPath) names.add((await macAppInfo(appPath)).executableName)
  const ids = new Set()
  for (const name of names) {
    try {
      const output = await exec('/usr/bin/pgrep', ['-x', name])
      output.split(/\r?\n/).filter(Boolean).forEach((pid) => ids.add(Number(pid)))
    } catch {}
  }
  return [...ids].filter(Number.isFinite)
}

async function processCount() {
  try {
    if (process.platform === 'darwin') {
      return (await macProcessIds()).length
    }
    // Modern Weixin creates several same-name plugin processes for one
    // account. Count only roots whose parent is not another WeChat process;
    // unlike window handles, roots remain stable while minimized to the tray.
    const script = "$p=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('WeChat.exe','Weixin.exe') }); $ids=@($p.ProcessId); @($p | Where-Object { $ids -notcontains $_.ParentProcessId }).Count"
    return Number(await exec('powershell.exe', ['-NoProfile', '-Command', script])) || 0
  } catch { return 0 }
}

async function status() {
  const count = await processCount()
  return { count, running: count > 0, isPair: count >= 2, checkedAt: Date.now() }
}

function startDetached(executable) {
  const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
}

function spawnMac(file, args, event, options = {}) {
  const child = spawn(file, args, { detached: true, stdio: 'ignore', ...options })
  child.once('error', (error) => macLog(`${event}-error`, { message: error.message }))
  child.unref()
  macLog(event, { file, args, pid: child.pid || null })
  return child
}

async function launchMacPrimary(appPath) {
  spawnMac('/usr/bin/open', [appPath], 'primary-launch-requested')
}

async function launchMacAdditional(appPath) {
  const info = await macAppInfo(appPath)
  if (!fs.existsSync(info.executablePath)) throw new Error('微信应用内的启动程序不存在。')
  spawnMac(info.executablePath, [], 'additional-launch-requested', { cwd: path.dirname(info.executablePath) })
}

async function waitForMacCount(minimum, timeoutMs = 12000) {
  const startedAt = Date.now()
  let stableSamples = 0
  let lastIds = []
  while (Date.now() - startedAt < timeoutMs) {
    lastIds = await macProcessIds()
    stableSamples = lastIds.length >= minimum ? stableSamples + 1 : 0
    if (stableSamples >= 2) {
      macLog('process-count-stable', { minimum, pids: lastIds })
      return lastIds.length
    }
    await wait(500)
  }
  macLog('process-count-timeout', { minimum, pids: lastIds })
  return lastIds.length
}

async function waitForMacExit(timeoutMs = 8000) {
  const startedAt = Date.now()
  let lastIds = []
  while (Date.now() - startedAt < timeoutMs) {
    lastIds = await macProcessIds()
    if (lastIds.length === 0) {
      macLog('processes-exited')
      return true
    }
    await wait(400)
  }
  macLog('process-exit-timeout', { pids: lastIds })
  return false
}

async function quitAll() {
  try {
    if (process.platform === 'darwin') {
      const target = resolveExecutable()
      const info = target.path ? await macAppInfo(target.path) : null
      if (info?.bundleId) await exec('/usr/bin/osascript', ['-e', `tell application id "${info.bundleId}" to quit`])
      else {
        try { await exec('/usr/bin/osascript', ['-e', 'tell application "WeChat" to quit']) } catch {}
        try { await exec('/usr/bin/osascript', ['-e', 'tell application "Weixin" to quit']) } catch {}
      }
      await waitForMacExit()
    } else {
      try { await exec('taskkill.exe', ['/IM', 'WeChat.exe', '/T', '/F']) } catch {}
      try { await exec('taskkill.exe', ['/IM', 'Weixin.exe', '/T', '/F']) } catch {}
    }
    await wait(900)
    return { ok: true, status: await status() }
  } catch (error) {
    return { ok: false, message: error.message, status: await status() }
  }
}

async function launchPair(restart) {
  const target = resolveExecutable()
  if (!target.path) return { ok: false, code: 'NOT_FOUND', message: '未找到微信，请先选择微信安装位置。' }
  const before = await status()
  if (before.running && !restart) {
    return { ok: false, code: 'ALREADY_RUNNING', message: '微信正在运行。要创建两个实例，需要先退出当前微信。', status: before }
  }
  if (before.running) {
    const quitResult = await quitAll()
    if (quitResult.status.running) {
      return { ok: false, code: 'QUIT_FAILED', message: '微信仍在运行，请完全退出后重试。', status: quitResult.status }
    }
  }
  try {
    if (process.platform === 'darwin') {
      macLog('pair-launch-started', { restart: Boolean(restart), beforeCount: before.count, appPath: target.path })
      await launchMacPrimary(target.path)
      if (await waitForMacCount(1) < 1) throw new Error('第一个微信实例未能稳定启动。')
      await wait(1000)
      await launchMacAdditional(target.path)
      await waitForMacCount(2)
    } else {
      startDetached(target.path)
      startDetached(target.path)
      await wait(2200)
    }
    const after = await status()
    macLog('pair-launch-finished', { afterCount: after.count, pids: process.platform === 'darwin' ? await macProcessIds(target.path) : [] })
    return {
      ok: after.count >= 2,
      code: after.count >= 2 ? 'PAIR_STARTED' : 'PARTIAL',
      message: after.count >= 2 ? '两个微信实例已启动。' : '已发起两次启动，但当前微信版本可能限制了多开。',
      status: after,
    }
  } catch (error) {
    return { ok: false, code: 'LAUNCH_FAILED', message: error.message, status: await status() }
  }
}

async function focusWeChat() {
  try {
    if (await processCount() === 0) return { ok: false, message: '当前没有正在运行的微信实例。' }
    if (process.platform === 'darwin') {
      const target = resolveExecutable()
      if (!target.path) return { ok: false, message: '未找到微信，请先选择微信安装位置。' }
      const beforeIds = await macProcessIds(target.path)
      const info = await macAppInfo(target.path)
      if (info.bundleId) {
        await exec('/usr/bin/osascript', ['-e', `tell application id "${info.bundleId}"`, '-e', 'reopen', '-e', 'activate', '-e', 'end tell'])
      } else {
        await exec('/usr/bin/open', [target.path])
      }
      await wait(700)
      const afterIds = await macProcessIds(target.path)
      macLog('focus-request-finished', { beforePids: beforeIds, afterPids: afterIds, bundleId: info.bundleId })
      if (afterIds.length === 0) return { ok: false, message: '微信进程已退出，未能恢复窗口。' }
    } else {
      const helper = app.isPackaged ? path.join(process.resourcesPath, 'focus-wechat.ps1') : path.join(__dirname, 'focus-wechat.ps1')
      const result = await exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper])
      if (result !== 'ACTIVATED') return { ok: false, message: result === 'NOT_FOUND' ? '当前没有正在运行的微信实例。' : '未能恢复微信窗口，请从微信托盘图标打开。' }
    }
    return { ok: true }
  } catch (error) { return { ok: false, message: error.message } }
}

async function prepareUpdate() {
  if (!app.isPackaged) {
    return { ok: true, state: 'development', version: app.getVersion(), message: '开发模式不检查更新，请在安装版中使用。' }
  }
  if (updateReadyVersion) {
    return { ok: true, state: 'ready', version: updateReadyVersion, message: `ChatNest v${updateReadyVersion} 已下载完成。` }
  }
  if (updatePreparation) return updatePreparation

  updatePreparation = (async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.isUpdateAvailable) {
        return { ok: true, state: 'current', version: app.getVersion(), message: '当前已是最新版本。' }
      }
      await autoUpdater.downloadUpdate(result.cancellationToken)
      updateReadyVersion = result.updateInfo.version
      return { ok: true, state: 'ready', version: updateReadyVersion, message: `ChatNest v${updateReadyVersion} 已下载完成。` }
    } catch (error) {
      return { ok: false, state: 'error', version: app.getVersion(), message: `检查更新失败：${error.message}` }
    } finally {
      updatePreparation = null
    }
  })()

  return updatePreparation
}

function createWindow() {
  const appIcon = path.join(__dirname, '..', 'build', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 940,
    minHeight: 650,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    backgroundColor: '#f6f7f4',
    icon: appIcon,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow.hide()
  })
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else mainWindow.loadURL('http://localhost:5173')
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  if (tray) return
  const iconSize = process.platform === 'darwin' ? 20 : 16
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: iconSize, height: iconSize })
  tray = new Tray(trayIcon)
  tray.setToolTip('ChatNest')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 ChatNest', click: showMainWindow },
    { type: 'separator' },
    { label: '退出 ChatNest', click: () => app.quit() },
  ]))
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png'))
  Menu.setApplicationMenu(null)
  createWindow()
  createTray()
  app.on('activate', showMainWindow)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.handle('wechat:get-overview', async () => ({
  platform: process.platform,
  executable: resolveExecutable(),
  status: await status(),
  version: app.getVersion(),
}))
ipcMain.handle('wechat:get-status', status)
ipcMain.handle('wechat:launch-pair', (_, { restart }) => launchPair(Boolean(restart)))
ipcMain.handle('wechat:launch-one', async () => {
  const target = resolveExecutable()
  if (!target.path) return { ok: false, message: '未找到微信，请先选择微信安装位置。' }
  try {
    const before = await status()
    if (process.platform === 'darwin') {
      macLog('single-launch-started', { beforeCount: before.count, appPath: target.path })
      if (before.count === 0) await launchMacPrimary(target.path)
      else await launchMacAdditional(target.path)
      await waitForMacCount(before.count + 1)
    } else {
      startDetached(target.path)
      await wait(1800)
    }
    const after = await status()
    macLog('single-launch-finished', { beforeCount: before.count, afterCount: after.count })
    const created = after.count > before.count
    return {
      ok: created,
      code: created ? 'INSTANCE_STARTED' : 'INSTANCE_NOT_CREATED',
      message: created ? '新的微信实例已启动。' : '微信没有创建新实例，请退出后使用“一键双开”。',
      status: after,
    }
  }
  catch (error) { return { ok: false, message: error.message } }
})
ipcMain.handle('wechat:focus', focusWeChat)
ipcMain.handle('wechat:quit-all', quitAll)
ipcMain.handle('wechat:choose-executable', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: process.platform === 'darwin' ? '选择微信应用' : '选择微信程序',
    properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'],
    filters: process.platform === 'win32' ? [{ name: '应用程序', extensions: ['exe'] }] : undefined,
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false }
  writeSettings({ ...readSettings(), executablePath: result.filePaths[0] })
  return { ok: true, executable: resolveExecutable() }
})
ipcMain.handle('wechat:reset-executable', async () => {
  const next = readSettings(); delete next.executablePath; writeSettings(next)
  return { ok: true, executable: resolveExecutable() }
})
ipcMain.handle('app:open-external', (_, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url)
})
ipcMain.handle('app:prepare-update', prepareUpdate)
ipcMain.handle('app:install-update', () => {
  if (!updateReadyVersion) return { ok: false, message: '更新尚未下载完成。' }
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return { ok: true }
})
