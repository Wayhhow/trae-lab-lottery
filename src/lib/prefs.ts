import type { RoundId } from '@/types'

const KEY = 'trae-lab-lottery:prefs:v1'

export interface Prefs {
  /** 全局静音，M 键切换 */
  muted: boolean
  /** 最后一次进入的抽奖环节，用于刷新后回到原处 */
  lastRoundId: RoundId | null
  /** 是否启用无操作屏保 */
  screensaver: boolean
}

const DEFAULTS: Prefs = {
  muted: false,
  lastRoundId: null,
  screensaver: true,
}

export function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULTS.muted,
      lastRoundId:
        parsed.lastRoundId === 'likes' ||
        parsed.lastRoundId === 'onsite' ||
        parsed.lastRoundId === 'consolation'
          ? parsed.lastRoundId
          : null,
      screensaver:
        typeof parsed.screensaver === 'boolean' ? parsed.screensaver : DEFAULTS.screensaver,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 存储不可用时静默降级
  }
  return next
}