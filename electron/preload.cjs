const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('chatnest', {
  getOverview: () => ipcRenderer.invoke('wechat:get-overview'),
  refreshStatus: () => ipcRenderer.invoke('wechat:get-status'),
  launchPair: (restart = false) => ipcRenderer.invoke('wechat:launch-pair', { restart }),
  launchOne: () => ipcRenderer.invoke('wechat:launch-one'),
  focus: () => ipcRenderer.invoke('wechat:focus'),
  quitAll: () => ipcRenderer.invoke('wechat:quit-all'),
  chooseExecutable: () => ipcRenderer.invoke('wechat:choose-executable'),
  resetExecutable: () => ipcRenderer.invoke('wechat:reset-executable'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  platform: process.platform,
})
