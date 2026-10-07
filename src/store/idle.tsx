import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePrefs } from '@/store/prefs'

/** 无操作进入屏保的时长 */
const IDLE_MS = 60_000

interface IdleContextValue {
  idle: boolean
  /** 任意操作唤醒 */
  wake: () => void
  /**
   * 占用期间不进入屏保。
   * 自动播放要连续跑一两分钟，不能被 60 秒无操作打断。
   */
  setHold: (hold: boolean) => void
}

const IdleContext = createContext<IdleContextValue | null>(null)

export function IdleProvider({ children }: { children: ReactNode }) {
  const { screensaver } = usePrefs()
  const [idle, setIdle] = useState(false)
  const lastActivity = useRef(Date.now())
  const held = useRef(false)

  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now()
      setIdle(false)
    }
    const events = ['keydown', 'pointerdown', 'mousemove', 'wheel', 'touchstart'] as const
    for (const name of events) window.addEventListener(name, bump, { passive: true })
    return () => {
      for (const name of events) window.removeEventListener(name, bump)
    }
  }, [])

  useEffect(() => {
    if (!screensaver) {
      setIdle(false)
      return
    }
    const timer = window.setInterval(() => {
      if (held.current) return
      if (Date.now() - lastActivity.current >= IDLE_MS) setIdle(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [screensaver])

  const setHold = useCallback((hold: boolean) => {
    held.current = hold
    if (hold) setIdle(false)
  }, [])

  const wake = useCallback(() => {
    lastActivity.current = Date.now()
    setIdle(false)
  }, [])

  const value = useMemo<IdleContextValue>(() => ({ idle, wake, setHold }), [idle, wake, setHold])

  return <IdleContext.Provider value={value}>{children}</IdleContext.Provider>
}

export function useIdle(): IdleContextValue {
  const context = useContext(IdleContext)
  if (!context) {
    throw new Error('useIdle 必须在 IdleProvider 内部使用')
  }
  return context
}