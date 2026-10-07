import { useCallback, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Screensaver } from '@/components/Screensaver'
import { ShortcutsOverlay } from '@/components/ShortcutsOverlay'
import { ROUND_META, ROUND_ORDER } from '@/config/rounds'
import { usePrefs } from '@/store/prefs'
import type { RoundId } from '@/types'

interface AppShellProps {
  children: ReactNode
  /** 当前环节，用于高亮顶部标签并记录「上次所在环节」 */
  activeRound?: RoundId
}

export function AppShell({ children, activeRound }: AppShellProps) {
  const navigate = useNavigate()
  const { muted, toggleMuted, rememberRound } = usePrefs()
  const [fullscreen, setFullscreen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // 记住当前环节，刷新或重新打开时可以直接回到这里
  useEffect(() => {
    if (activeRound) rememberRound(activeRound)
  }, [activeRound, rememberRound])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // F 键全屏切换
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen()
    }
  }, [])

  // → 键切到下一组（环节）
  const goNextRound = useCallback(() => {
    const currentIndex = activeRound ? ROUND_ORDER.indexOf(activeRound) : -1
    const nextIndex = (currentIndex + 1) % ROUND_ORDER.length
    const next = ROUND_ORDER[nextIndex]
    if (next) navigate(`/round/${next}`)
  }, [activeRound, navigate])

  // 全局快捷键。空格由各环节页面自行处理，这里不接管
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return

      if (event.code === 'Escape') {
        setShortcutsOpen(false)
        return
      }

      switch (event.key.toLowerCase()) {
        case 'f':
          event.preventDefault()
          toggleFullscreen()
          break
        case 'm':
          event.preventDefault()
          toggleMuted()
          break
        case 'h':
          event.preventDefault()
          setShortcutsOpen((open) => !open)
          break
        case 'arrowright':
          event.preventDefault()
          setShortcutsOpen(false)
          goNextRound()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFullscreen, toggleMuted, goNextRound])

  return (
    <div className="lab-grid flex h-screen w-screen flex-col overflow-hidden bg-lab-void">
      <header className="flex shrink-0 items-center gap-6 border-b border-lab-line bg-lab-bg/80 px-6 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-3 text-left"
        >
          <span className="grid size-8 place-items-center rounded-md border border-trae/40 bg-trae/10 font-mono text-[0.8125rem] font-semibold text-trae">
            TR
          </span>
          <span className="leading-tight">
            <span className="block text-[0.9375rem] font-semibold tracking-wide text-lab-ink">
              TRAE 实验室
            </span>
            <span className="block font-mono text-[0.6875rem] tracking-[0.18em] text-lab-dim">
              RANDOMIZER · 百人摇号
            </span>
          </span>
        </button>

        <nav className="flex items-center gap-1">
          {ROUND_ORDER.map((roundId) => {
            const meta = ROUND_META[roundId]
            const active = activeRound === roundId
            return (
              <button
                key={roundId}
                type="button"
                onClick={() => navigate(`/round/${roundId}`)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                  active
                    ? 'border-trae/50 bg-trae/10 text-trae'
                    : 'border-transparent text-lab-dim hover:border-lab-line hover:text-lab-ink'
                }`}
              >
                <span className="font-mono text-[0.6875rem] opacity-70">{meta.code}</span>
                {meta.title}
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NavLink
            to="/overview"
            className={({ isActive }) =>
              `rounded-lg border px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-trae/50 text-trae'
                  : 'border-lab-line text-lab-dim hover:text-lab-ink'
              }`
            }
          >
            总览
          </NavLink>
          <NavLink
            to="/logs"
            className={({ isActive }) =>
              `rounded-lg border px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-trae/50 text-trae'
                  : 'border-lab-line text-lab-dim hover:text-lab-ink'
              }`
            }
          >
            开奖记录
          </NavLink>

          {/* 静音状态需要有明确视觉反馈 */}
          <button
            type="button"
            onClick={toggleMuted}
            title="静音切换 (M)"
            aria-pressed={muted}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              muted
                ? 'border-warn/60 bg-warn/10 text-warn'
                : 'border-lab-line text-lab-dim hover:text-lab-ink'
            }`}
          >
            <span className="font-mono text-[0.875rem]">{muted ? '🔇' : '🔊'}</span>
            <span className="font-mono text-[0.6875rem] tracking-wider">
              {muted ? 'MUTED' : 'SOUND ON'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen((open) => !open)}
            title="快捷键说明 (H)"
            className="rounded-lg border border-lab-line px-3 py-2 font-mono text-[0.75rem] text-lab-dim transition-colors hover:text-lab-ink"
          >
            H · 快捷键
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg border border-lab-line px-3 py-2 font-mono text-[0.75rem] text-lab-dim transition-colors hover:text-lab-ink"
          >
            {fullscreen ? 'EXIT FS' : 'FULL SCREEN'}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">{children}</main>

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Screensaver />
    </div>
  )
}

const PHASE_LABEL = {
  idle: '待机',
  spinning: '摇号中',
  ejecting: '出球',
  revealed: '中奖展示',
} as const

const PHASE_ORDER = ['idle', 'spinning', 'ejecting', 'revealed'] as const

export function PhaseIndicator({ phase }: { phase: (typeof PHASE_ORDER)[number] }) {
  return (
    <div className="flex items-center gap-2">
      {PHASE_ORDER.map((item, index) => {
        const active = item === phase
        const passed = PHASE_ORDER.indexOf(phase) > index
        return (
          <div key={item} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.75rem] transition-colors ${
                active
                  ? 'glow-trae border-trae/60 bg-trae/10 text-trae'
                  : passed
                    ? 'border-lab-line text-lab-dim'
                    : 'border-lab-line/60 text-lab-faint'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  active ? 'animate-pulse bg-trae' : passed ? 'bg-lab-dim' : 'bg-lab-faint'
                }`}
              />
              {PHASE_LABEL[item]}
            </div>
            {index < PHASE_ORDER.length - 1 && <span className="text-lab-faint">›</span>}
          </div>
        )
      })}
    </div>
  )
}