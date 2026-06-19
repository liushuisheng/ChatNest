import { useCallback, useEffect, useState } from 'react'

type ChatNestBridge = NonNullable<typeof window.chatnest>
type Overview = Awaited<ReturnType<ChatNestBridge['getOverview']>>
type IconName = 'grid' | 'settings' | 'help' | 'refresh' | 'play' | 'focus' | 'power' | 'folder' | 'check' | 'warning' | 'wechat'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.4.37.75.68 1 .3.27.7.4 1.1.4h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.7 2.7 0 1 1 4.3 2.2c-1 .75-1.9 1.2-1.9 2.8"/><path d="M12 18h.01"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.4-2.6L20 9M4 15l2.5 2.6A7 7 0 0 0 17.9 15"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    focus: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><circle cx="12" cy="12" r="3"/></>,
    power: <><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></>,
    folder: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    warning: <><path d="M10.3 3.6 2.4 18a2 2 0 0 0 1.75 3h15.7a2 2 0 0 0 1.75-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    wechat: <><path d="M15.5 11.5c0-4-3.6-7-8-7s-8 3-8 7c0 2.3 1.2 4.3 3.2 5.6L2 19.7l3-1.5c.8.2 1.6.3 2.5.3"/><path d="M24.5 15.7c0 3.3-3 5.8-6.8 5.8-.7 0-1.4-.1-2-.3l-2.6 1.3.6-2.2c-1.7-1.1-2.7-2.8-2.7-4.6 0-3.2 3-5.8 6.7-5.8s6.8 2.6 6.8 5.8Z"/><path d="M5 10h.01M10 10h.01M15.5 15h.01M20 15h.01"/></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function App() {
  const chatnest = window.chatnest!
  const [overview, setOverview] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [page, setPage] = useState<'home' | 'settings' | 'help'>('home')

  const refresh = useCallback(async () => {
    const data = overview ? { ...overview, status: await chatnest.refreshStatus() } : await chatnest.getOverview()
    setOverview(data)
  }, [overview])

  useEffect(() => { chatnest.getOverview().then(setOverview) }, [])
  useEffect(() => {
    const timer = setInterval(() => chatnest.refreshStatus().then((status) => setOverview((v) => v ? { ...v, status } : v)), 3500)
    return () => clearInterval(timer)
  }, [])

  const notify = (text: string, error = false) => {
    setToast({ text, error }); setTimeout(() => setToast(null), 3600)
  }

  const act = async (action: () => Promise<ActionResult>) => {
    setBusy(true)
    try {
      const result = await action()
      if (result.code === 'ALREADY_RUNNING') { setConfirmRestart(true); return }
      notify(result.message || (result.ok ? '操作完成' : '操作未完成'), !result.ok)
      await refresh()
    } finally { setBusy(false) }
  }

  const choose = async () => {
    const result = await chatnest.chooseExecutable()
    if (result.ok) { await refresh(); notify('微信位置已更新') }
  }

  if (!overview) return <div className="loading"><div className="brand-mark small"><Icon name="wechat" size={25}/></div><span>正在准备你的工作台…</span></div>

  const { status, executable } = overview
  const healthy = executable.source !== 'missing'
  const stateLabel = status.isPair ? '双实例运行中' : status.running ? `${status.count} 个实例运行中` : '当前未运行'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Icon name="wechat" size={24}/></div><div><strong>ChatNest</strong><span>把生活分开一点</span></div></div>
        <nav>
          <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}><Icon name="grid"/>实例管理</button>
          <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Icon name="settings"/>应用设置</button>
        </nav>
        <div className="sidebar-bottom">
          <button className={page === 'help' ? 'active' : ''} onClick={() => setPage('help')}><Icon name="help"/>使用帮助</button>
          <div className="device"><span className={`pulse ${status.running ? 'on' : ''}`}/><div><b>{overview.platform === 'darwin' ? 'macOS' : 'Windows'} 设备</b><small>ChatNest v{overview.version}</small></div></div>
        </div>
      </aside>

      <main>
        {page === 'home' && <>
          <header><div><p className="eyebrow">微信实例</p><h1>今天，要用哪个身份？</h1><p className="subtitle">同时登录工作号与生活号，消息互不打扰。</p></div><button className="icon-button" aria-label="刷新状态" onClick={refresh}><Icon name="refresh"/></button></header>

          {!healthy && <div className="notice warning"><Icon name="warning"/><div><b>还差一步</b><span>没有自动找到微信，请选择安装位置后开始。</span></div><button onClick={choose}>选择微信</button></div>}

          <section className="hero-card">
            <div className="hero-copy"><div className={`status-pill ${status.running ? 'online' : ''}`}><span/>{stateLabel}</div><h2>一键开启两个微信</h2><p>{overview.platform === 'darwin' ? '通过 macOS 原生新实例能力，分别打开两个微信窗口。' : '同时唤起两个独立微信进程，分别扫码登录工作号与生活号。'}</p>
              <div className="hero-actions"><button className="primary" disabled={busy || !healthy} onClick={() => act(() => window.chatnest.launchPair(false))}><Icon name="play"/>{busy ? '正在启动…' : status.isPair ? '已开启双实例' : '立即双开'}</button>{status.running && <button className="secondary" onClick={() => act(window.chatnest.focus)}><Icon name="focus"/>显示微信</button>}</div>
            </div>
            <div className="nest-visual"><div className="orbit one"/><div className="orbit two"/><div className="avatar work"><span>工</span><i/></div><div className="avatar life"><span>生</span><i/></div><div className="nest-center"><Icon name="wechat" size={33}/></div></div>
          </section>

          <div className="section-title"><div><h3>实例状态</h3><p>ChatNest 会自动感知微信进程状态</p></div><span>每 3.5 秒自动刷新</span></div>
          <section className="instance-grid">
            {[0, 1].map((index) => { const online = status.count > index; return <article className="instance-card" key={index}>
              <div className="instance-top"><div className={`instance-logo ${index ? 'orange' : ''}`}><Icon name="wechat" size={26}/></div><span className={`tag ${online ? 'online' : ''}`}>{online ? '运行中' : '未启动'}</span></div>
              <div><h4>{index === 0 ? '工作微信' : '生活微信'}</h4><p>{online ? '微信实例运行正常' : index === 0 ? '用于客户、同事与工作群' : '用于家人、朋友与日常社交'}</p></div>
              <button disabled={busy} onClick={() => act(online ? window.chatnest.focus : window.chatnest.launchOne)}>{online ? <><Icon name="focus" size={18}/>打开窗口</> : <><Icon name="play" size={17}/>{busy ? '启动中…' : '立即启动'}</>}</button>
            </article> })}
          </section>
          {status.running && <button className="quit-link" onClick={() => act(window.chatnest.quitAll)}><Icon name="power" size={17}/>退出全部微信</button>}
        </>}

        {page === 'settings' && <Settings overview={overview} choose={choose} refresh={refresh} notify={notify}/>} 
        {page === 'help' && <Help platform={overview.platform}/>} 
      </main>

      {confirmRestart && <div className="modal-backdrop"><div className="modal"><div className="modal-icon"><Icon name="refresh" size={24}/></div><h3>需要重启当前微信</h3><p>微信已经在运行。为确保双开成功，ChatNest 需要先退出当前微信，再连续启动两个实例。请先保存未发送的内容。</p><div><button className="secondary" onClick={() => setConfirmRestart(false)}>取消</button><button className="primary danger" onClick={() => { setConfirmRestart(false); act(() => window.chatnest.launchPair(true)) }}>退出并双开</button></div></div></div>}
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}><Icon name={toast.error ? 'warning' : 'check'} size={18}/>{toast.text}</div>}
    </div>
  )
}

function Settings({ overview, choose, refresh, notify }: { overview: Overview; choose: () => void; refresh: () => Promise<void>; notify: (text: string, error?: boolean) => void }) {
  const [updateBusy, setUpdateBusy] = useState(false)
  const [readyVersion, setReadyVersion] = useState('')
  const reset = async () => { await window.chatnest.resetExecutable(); await refresh(); notify('已恢复自动检测') }
  const update = async () => {
    if (readyVersion) {
      const result = await window.chatnest.installUpdate()
      if (!result.ok) notify(result.message || '暂时无法安装更新', true)
      return
    }
    setUpdateBusy(true)
    try {
      const result = await window.chatnest.prepareUpdate()
      if (result.state === 'ready') setReadyVersion(result.version)
      notify(result.message, !result.ok)
    } finally { setUpdateBusy(false) }
  }
  return <div className="subpage"><header><div><p className="eyebrow">偏好设置</p><h1>应用设置</h1><p className="subtitle">保持简单，也保留必要的控制。</p></div></header>
    <section className="settings-card"><div className="setting-row"><div className="setting-icon"><Icon name="folder"/></div><div className="setting-copy"><h3>微信安装位置</h3><p className="path">{overview.executable.path || '尚未找到微信应用'}</p><small>{overview.executable.source === 'custom' ? '手动指定' : overview.executable.source === 'auto' ? '已自动检测' : '需要手动选择'}</small></div><button className="secondary" onClick={choose}>更改</button></div>{overview.executable.source === 'custom' && <button className="text-button" onClick={reset}>恢复自动检测</button>}</section>
    <section className="settings-card"><div className="setting-row"><div className="setting-icon"><Icon name="refresh"/></div><div className="setting-copy"><h3>应用更新</h3><p>{readyVersion ? `ChatNest v${readyVersion} 已准备好` : `当前版本 v${overview.version}`}</p><small>{readyVersion ? '重启后将自动完成升级' : '从 GitHub Releases 获取正式版本'}</small></div><button className="secondary" disabled={updateBusy} onClick={update}>{updateBusy ? '检查并下载中…' : readyVersion ? '重启并升级' : '检查更新'}</button></div></section>
    <section className="settings-card about"><h3>关于 ChatNest</h3><p>ChatNest 专注于安全、清晰地管理两个微信实例。它不读取聊天记录、不保存账号密码，也不会注入或修改微信程序。</p><div><span>当前版本</span><b>v{overview.version}</b></div><div><span>运行平台</span><b>{overview.platform === 'darwin' ? 'macOS' : 'Windows'}</b></div></section>
  </div>
}

function Help({ platform }: { platform: string }) {
  const steps = platform === 'darwin' ? ['确认微信已安装在“应用程序”文件夹', '点击“立即双开”，ChatNest 会创建两个新实例', '分别在两个微信窗口扫码登录'] : ['首次使用前，请彻底退出正在运行的微信', '点击“立即双开”，ChatNest 会快速启动两个进程', '分别在两个微信窗口扫码登录']
  return <div className="subpage"><header><div><p className="eyebrow">快速上手</p><h1>使用帮助</h1><p className="subtitle">三步把工作与生活分开放好。</p></div></header><section className="help-card">{steps.map((step, index) => <div className="help-step" key={step}><span>{index + 1}</span><div><h3>{step}</h3><p>{index === 1 ? '启动过程中请稍等几秒，不要重复点击。' : index === 2 ? '两个账号的数据仍由微信官方客户端管理。' : 'ChatNest 会自动检测常见安装位置。'}</p></div></div>)}</section><div className="privacy-note"><Icon name="check"/><div><h3>你的数据留在微信里</h3><p>ChatNest 只负责启动和感知进程，不接触账号、密码或聊天内容。</p></div></div></div>
}

export default App
