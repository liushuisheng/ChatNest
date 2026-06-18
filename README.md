# ChatNest

ChatNest 是一个面向 Windows 与 macOS 的微信多实例桌面启动器，专注于让用户清楚、安全地同时打开工作微信和生活微信。

## 核心功能

- 一键启动两个微信实例
- 自动检测微信安装位置，也可手动指定
- 感知当前微信进程数量及双开状态
- 聚焦微信窗口、退出全部微信
- 在已有微信运行时，二次确认后重启并双开
- Windows 与 macOS 原生启动适配
- 不读取账号、密码或聊天记录

## 产品流程

1. ChatNest 自动寻找微信；找不到时引导用户选择程序。
2. 用户点击“立即双开”。
3. 如果微信未运行，连续启动两个实例；如果已运行，先提示用户保存内容并确认重启。
4. 首页持续显示两个实例的运行状态。

Windows 版通过连续拉起 `WeChat.exe` / `Weixin.exe`，利用客户端互斥锁建立前的时间窗口创建两个实例；macOS 版通过系统的 `open -n` 创建新应用实例。微信后续版本可能改变多开限制，因此 ChatNest 会校验实际进程数并反馈结果，而不会假装成功。

## 本地开发

```bash
npm install
npm run dev
```

构建前端并检查 TypeScript：

```bash
npm run build
```

生成安装包：

```bash
npm run dist:win
npm run dist:mac
```

macOS 安装包需要在 macOS 设备上生成；正式分发时还应配置 Apple Developer ID 签名与公证。Windows 正式分发建议配置代码签名证书，以减少 SmartScreen 警告。

## 技术结构

- `electron/main.cjs`：窗口、进程检测、系统启动与 IPC
- `electron/preload.cjs`：隔离后的安全前端桥接
- `src/`：React + TypeScript 产品界面
- `electron-builder`：Windows NSIS 与 macOS DMG 打包

## 版本与自动发布

项目使用语义化版本号，`package.json` 是版本号的唯一来源：

```bash
# 修复版本：0.1.0 -> 0.1.1
npm version patch

# 功能版本：0.1.0 -> 0.2.0
npm version minor

# 重大版本：0.1.0 -> 1.0.0
npm version major
```

`npm version` 会同步更新 `package-lock.json`、创建版本提交和 `vX.Y.Z` 标签。推送提交与标签后，GitHub Actions 会自动生成 Release：

```bash
git push origin main --follow-tags
```

每个 Release 包含四种安装包：

- Windows x64：常见 Intel/AMD Windows 电脑
- Windows arm64：Windows on ARM 设备
- macOS x64：Intel Mac
- macOS arm64：Apple Silicon（M1 及后续芯片）

工作流会校验 Git 标签和 `package.json` 版本一致，文件名格式为 `ChatNest-版本-平台-架构.扩展名`。日常推送和 Pull Request 还会运行 TypeScript 与前端构建检查。

当前自动发布产物未签名，适合内部测试。公开分发前应把 Windows 代码签名证书、Apple Developer ID 证书及公证凭据配置为 GitHub Secrets。

## 产品边界

ChatNest 不修改、不注入微信客户端，也不绕过账号风控。实例标签目前是产品层的“工作/生活”语义，微信进程本身不会暴露具体登录账号。退出操作会退出所有检测到的微信实例。
