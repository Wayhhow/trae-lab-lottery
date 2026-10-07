import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { destroyAudio, playEject, playWin, setMuted, unlockAudio } from '@/lib/audio'
import { readPrefs, writePrefs } from '@/lib/prefs'
import type { RoundId } from '@/types'

interface PrefsContextValue {
  muted: boolean
  screensaver: boolean
  toggleMuted: () => void
  setScreensaver: (enabled: boolean) => void
  /** 记录当前环节，刷新后可以直接回到这里 */
  rememberRound: (roundId: RoundId) => void
  playEject: () => void
  playWin: () => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(() => readPrefs().muted)
  const [screensaver, setScreensaverState] = useState(() => readPrefs().screensaver)

  // 首屏就把静音偏好同步给音频层
  useEffect(() => {
    setMuted(readPrefs().muted)
  }, [])

  // 浏览器要求首次用户手势之后才能出声，这里统一在根节点上解锁
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // 页面关闭时释放 Howl 实例与 blob URL
  useEffect(() => () => destroyAudio(), [])

  const toggleMuted = useCallback(() => {
    setMutedState((current) => {
      const next = !current
      setMuted(next)
      writePrefs({ muted: next })
      return next
    })
  }, [])

  const setScreensaver = useCallback((enabled: boolean) => {
    setScreensaverState(enabled)
    writePrefs({ screensaver: enabled })
  }, [])

  const rememberRound = useCallback((roundId: RoundId) => {
    writePrefs({ lastRoundId: roundId })
  }, [])

  const value = useMemo<PrefsContextValue>(
    () => ({
      muted,
      screensaver,
      toggleMuted,
      setScreensaver,
      rememberRound,
      playEject,
      playWin,
    }),
    [muted, screensaver, toggleMuted, setScreensaver, rememberRound],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): PrefsContextValue {
  const context = useContext(PrefsContext)
  if (!context) {
    throw new Error('usePrefs 必须在 PrefsProvider 内部使用')
  }
  return context
}

/** 供路由重定向使用：不依赖 React 上下文 */
export function rememberedRound(): RoundId | null {
  return readPrefs().lastRoundId
}