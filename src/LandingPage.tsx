import { useEffect, useState } from 'react'
import './landing.css'
import packageInfo from '../package.json'

const version = packageInfo.version
const releaseBase = `https://github.com/liushuisheng/ChatNest/releases/download/v${version}`

const downloads = [
  { platform: 'Windows', arch: 'x64', note: '适用于大多数 Windows 电脑', file: `ChatNest-${version}-win-x64.exe`, icon: 'windows' },
  { platform: 'Windows', arch: 'ARM64', note: '适用于骁龙等 ARM 设备', file: `ChatNest-${version}-win-arm64.exe`, icon: 'windows' },
  { platform: 'macOS', arch: 'Apple 芯片', note: '适用于 M1、M2、M3 及后续芯片', file: `ChatNest-${version}-mac-arm64.dmg`, icon: 'apple' },
  { platform: 'macOS', arch: 'Intel', note: '适用于 Intel 芯片 Mac', file: `ChatNest-${version}-mac-x64.dmg`, icon: 'apple' },
]

function Mark({ size = 38 }: { size?: number }) {
  return <span className="site-mark" style={{ width: size, height: size }} aria-hidden="true"><i/><i/></span>
}

function PlatformIcon({ name }: { name: string }) {
  if (name === 'windows') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.2 10.5 4v7.2H3V5.2Zm8.5-1.4L21 2.4v8.8h-9.5V3.8ZM3 12.3h7.5v7.3L3 18.5v-6.2Zm8.5 0H21v9.3l-9.5-1.4v-7.9Z"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.1 12.5c0-2.7 2.2-4 2.3-4.1a5 5 0 0 0-3.9-2.1c-1.7-.2-3.2 1-4.1 1s-2.2-1-3.6-1C6 6.4 4.2 7.4 3.3 9c-1.9 3.2-.5 8 1.3 10.6.9 1.3 2 2.7 3.4 2.6 1.3-.1 1.9-.9 3.5-.9s2.1.9 3.6.8c1.5 0 2.4-1.3 3.3-2.6 1-1.5 1.5-3 1.5-3.1-.1 0-2.8-1.1-2.8-3.9ZM14.4 4.6A4.6 4.6 0 0 0 15.5 1a4.8 4.8 0 0 0-3.2 1.7 4.3 4.3 0 0 0-1.1 3.4 4 4 0 0 0 3.2-1.5Z"/></svg>
}

function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/></svg>
}

function LandingPage() {
  const [downloadCounts, setDownloadCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (window.location.hostname !== 'liushuisheng.github.io') return

    const analytics = document.createElement('script')
    analytics.defer = true
    analytics.src = 'https://static.cloudflareinsights.com/beacon.min.js'
    analytics.dataset.cfBeacon = JSON.stringify({ token: 'b8b375d6319949e7b4b2fa52418c34f7' })
    document.head.appendChild(analytics)

    return () => analytics.remove()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`https://api.github.com/repos/liushuisheng/ChatNest/releases/tags/v${version}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub API returned ${response.status}`)
        return response.json() as Promise<{ assets?: Array<{ name: string; download_count: number }> }>
      })
      .then((release) => setDownloadCounts(Object.fromEntries(
        (release.assets ?? []).map((asset) => [asset.name, Math.max(99, asset.download_count)]),
      )))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Unable to load download counts')
      })

    return () => controller.abort()
  }, [])

  const scrollToDownloads = () => document.querySelector('#downloads')?.scrollIntoView({ behavior: 'smooth' })

  return <div className="landing-page">
    <nav className="site-nav">
      <a className="site-brand" href="#top" aria-label="ChatNest 首页"><Mark/><strong>ChatNest</strong></a>
      <div className="nav-links"><a href="#features">功能</a><a href="#safety">安全</a><a href="https://github.com/liushuisheng/ChatNest" target="_blank" rel="noreferrer">GitHub</a></div>
      <button onClick={scrollToDownloads}>免费下载 <Arrow/></button>
    </nav>

    <main id="top">
      <section className="landing-hero">
        <div className="hero-aura aura-one"/><div className="hero-aura aura-two"/>
        <div className="landing-hero-copy">
          <div className="version-chip"><span/>ChatNest v{version} 已发布</div>
          <h1>两个微信，<br/><em>各得其所。</em></h1>
          <p>一个留给工作，一个留给生活。ChatNest 帮你在一台电脑上轻松开启两个微信实例，清楚、安静、不打扰。</p>
          <div className="landing-actions"><button className="download-primary" onClick={scrollToDownloads}><Arrow/>下载 ChatNest</button><a href="#features">了解它如何工作 <span>→</span></a></div>
          <div className="hero-meta"><span>✓ 免费使用</span><span>✓ 不读取聊天内容</span><span>✓ Windows 与 macOS</span></div>
        </div>

        <div className="product-scene" aria-label="ChatNest 应用界面示意图">
          <div className="scene-backdrop"/>
          <div className="app-preview">
            <div className="preview-sidebar"><div className="preview-logo"><Mark size={28}/><b>ChatNest</b></div><i/><i/><i className="short"/><span/></div>
            <div className="preview-main"><div className="preview-top"><div><small>微信实例</small><b>今天，要用哪个身份？</b></div><i>↻</i></div><div className="preview-banner"><span>一键开启两个微信</span><small>工作与生活，消息互不打扰</small><button>▶ 立即双开</button><div className="mini-orbit"><i>工</i><b>生</b></div></div><small className="preview-label">实例状态</small><div className="preview-cards"><div><i>工</i><b>工作微信</b><small>运行正常</small></div><div><i>生</i><b>生活微信</b><small>等待启动</small></div></div></div>
          </div>
          <div className="floating-card work-card"><span>工</span><div><b>工作微信</b><small>运行中</small></div><i/></div>
          <div className="floating-card life-card"><span>生</span><div><b>生活微信</b><small>已连接</small></div><i/></div>
        </div>
      </section>

      <section className="feature-strip" id="features">
        <article><span>01</span><div><h2>一键双开</h2><p>无需脚本和复杂操作，一次点击打开两个独立微信实例。</p></div></article>
        <article><span>02</span><div><h2>状态感知</h2><p>自动检测微信运行状态，工作号、生活号一眼分清。</p></div></article>
        <article id="safety"><span>03</span><div><h2>边界清楚</h2><p>不读取账号、密码或聊天记录，只负责启动与进程管理。</p></div></article>
      </section>

      <section className="download-section" id="downloads">
        <div className="section-heading"><span>DOWNLOAD</span><h2>选择适合你的版本</h2><p>当前版本 v{version} · 免费下载 · 安装即用</p></div>
        <div className="download-grid">
          {downloads.map((item) => <a className="download-card" href={`${releaseBase}/${item.file}`} key={item.file}>
            <span className={`platform-icon ${item.icon}`}><PlatformIcon name={item.icon}/></span>
            <div><small>{item.platform}</small><h3>{item.arch}</h3><p>{item.note}</p><b className="download-count">{downloadCounts[item.file] ?? 99} 次下载</b></div><span className="card-arrow"><Arrow/></span>
          </a>)}
        </div>
        <p className="release-note">不确定该选哪个？Windows 用户通常选择 x64，M 系列 Mac 请选择 Apple 芯片。<a href="https://github.com/liushuisheng/ChatNest/releases/latest" target="_blank" rel="noreferrer">查看全部发布文件 →</a></p>
      </section>

      <section className="privacy-banner"><div><Mark size={54}/></div><div><span>安心一点</span><h2>你的聊天，始终只属于你。</h2><p>ChatNest 不注入、不修改微信，也不接触任何账号信息与聊天内容。它只是安静地帮你打开和管理微信进程。</p></div></section>
    </main>

    <footer><a className="site-brand" href="#top"><Mark size={30}/><strong>ChatNest</strong></a><p>把工作与生活，放进各自的空间。</p><div><span>© 2026 ChatNest</span><a href="https://github.com/liushuisheng/ChatNest" target="_blank" rel="noreferrer">GitHub</a></div></footer>
  </div>
}

export default LandingPage
