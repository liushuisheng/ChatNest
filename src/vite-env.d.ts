/// <reference types="vite/client" />

type Status = { count: number; running: boolean; isPair: boolean; checkedAt: number }
type Executable = { path: string; source: 'custom' | 'auto' | 'missing' }
type ActionResult = { ok: boolean; code?: string; message?: string; status?: Status }

interface Window {
  chatnest: {
    getOverview(): Promise<{ platform: string; executable: Executable; status: Status; version: string }>
    refreshStatus(): Promise<Status>
    launchPair(restart?: boolean): Promise<ActionResult>
    launchOne(): Promise<ActionResult>
    focus(): Promise<ActionResult>
    quitAll(): Promise<ActionResult>
    chooseExecutable(): Promise<{ ok: boolean; executable?: Executable }>
    resetExecutable(): Promise<{ ok: boolean; executable: Executable }>
    openExternal(url: string): Promise<void>
    platform: string
  }
}
