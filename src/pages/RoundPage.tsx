import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AppShell, PhaseIndicator } from '@/components/AppShell'
import { BallMachine } from '@/components/BallMachine'
import { FinalPrizeOverlay } from '@/components/FinalPrizeOverlay'
import { PrizeRail } from '@/components/PrizeRail'
import { WinnerBoard } from '@/components/WinnerBoard'
import { WinnerWall } from '@/components/WinnerWall'
import { ROUND_META, getPrizeGroups, isFinalGroup, totalPrizeCount } from '@/config/rounds'
import { useDrawMachine } from '@/hooks/useDrawMachine'
import { useFastDraw } from '@/hooks/useFastDraw'
import { useIdle } from '@/store/idle'
import { useLottery } from '@/store/lottery'
import { usePrefs } from '@/store/prefs'
import type { RoundId } from '@/types'

const ROUND_IDS: RoundId[] = ['likes', 'onsite', 'consolation']

/** 压轴奖品全屏提示时长，落在要求的 3~5 秒内 */
const FINALE_MS = 3500
/** 自动连抽：待机后停顿一下再开抽，让观众看到球开始翻滚 */
const AUTO_START_DELAY_MS = 900
/** 自动连抽：中奖名停留时长，够观众看清再自动进入下一份 */
const AUTO_CONFIRM_DELAY_MS = 2500

function isRoundId(value: string | undefined): value is RoundId {
  return value !== undefined && ROUND_IDS.includes(value as RoundId)
}

export function RoundPage() {
  const params = useParams<{ roundId: string }>()
  const roundId = params.roundId

  if (!isRoundId(roundId)) {
    return <Navigate to="/overview" replace />
  }

  return <RoundStage roundId={roundId} />
}

function RoundStage({ roundId }: { roundId: RoundId }) {
  const { rosterOf, recordsOf, poolOf, drawnSlotIndexesOf, undoLast, resetRound } = useLottery()
  const { playEject, playWin } = usePrefs()
  const { idle, setHold } = useIdle()

  const meta = ROUND_META[roundId]
  const roster = rosterOf(roundId)
  const records = recordsOf(roundId)
  // poolOf 每次调用都会新建数组，必须 memo，否则 BallMachine 的同步 effect 会在每次渲染重跑
  const pool = useMemo(() => poolOf(roundId), [poolOf, roundId])
  const drawnSlotIndexes = drawnSlotIndexesOf(roundId)
  const groups = useMemo(() => getPrizeGroups(roundId), [roundId])
  const machine = useDrawMachine(roundId)
  const fast = useFastDraw(roundId)

  const [finale, setFinale] = useState<{ prizeName: string; remaining: number } | null>(null)
  const [fastOpen, setFastOpen] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const finaleShownFor = useRef<number | null>(null)
  const finaleTimer = useRef<number | null>(null)

  // start() 会在 3.5 秒后从定时器里被调用，必须取最新一版，避免闭包里的状态过期
  const machineRef = useRef(machine)
  machineRef.current = machine

  // 定时器回调里要读最新的自动播放开关，否则按下 A 停止后已排队的那一次仍会执行
  const autoPlayRef = useRef(autoPlay)
  autoPlayRef.current = autoPlay

  const isFinalSlot = machine.slot ? isFinalGroup(groups, machine.slot.groupId) : false
  const busy = machine.phase === 'spinning' || machine.phase === 'ejecting'
  const fastModeAvailable = roundId === 'consolation'
  // 安慰轮已经有「快速模式」一次抽满，不需要自动连抽
  const autoPlayAvailable = roundId !== 'consolation'
  const totalSlots = useMemo(() => totalPrizeCount(groups), [groups])

  // 出球与中奖音效。鼓风底噪已移除，这里只发必要的提示音
  const previousPhase = useRef(machine.phase)
  useEffect(() => {
    const previous = previousPhase.current
    previousPhase.current = machine.phase
    if (previous === machine.phase) return
    if (machine.phase === 'ejecting') playEject()
    if (machine.phase === 'revealed') playWin()
  }, [machine.phase, playEject, playWin])

  useEffect(
    () => () => {
      if (finaleTimer.current !== null) window.clearTimeout(finaleTimer.current)
    },
    [],
  )

  const advance = useCallback(() => {
    // 屏保期间第一次按键只负责唤醒，不推进抽奖
    if (idle || finale) return
    if (fastOpen) return

    if (machine.phase === 'revealed') {
      machine.confirm()
      return
    }
    if (machine.phase !== 'idle') return
    if (!machine.canStart || !machine.slot) return

    // 压轴奖品：先播一段全屏提示，再走原有流程
    if (isFinalSlot && finaleShownFor.current !== machine.slot.slotIndex) {
      finaleShownFor.current = machine.slot.slotIndex
      setFinale({
        prizeName: machine.slot.groupName,
        remaining: machine.slot.groupTotal - machine.slot.groupSlot + 1,
      })
      finaleTimer.current = window.setTimeout(() => {
        setFinale(null)
        machineRef.current.start()
      }, FINALE_MS)
      return
    }

    machine.start()
  }, [idle, finale, fastOpen, machine, isFinalSlot])

  const advanceRef = useRef(advance)
  advanceRef.current = advance

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay((on) => !on)
  }, [])

  // 切到别的环节就停掉，避免带着自动播放跑到下一轮
  useEffect(() => {
    setAutoPlay(false)
  }, [roundId])

  // 自动播放期间占住屏保，否则现场轮跑到 60 秒会被屏保盖住
  useEffect(() => {
    setHold(autoPlay)
    return () => setHold(false)
  }, [autoPlay, setHold])

  /**
   * 自动连抽的驱动：只监听相位变化，每次相位落定后排一次下一步。
   * 压轴奖的 FINAL PRIZE 延迟已经在 advance() 里处理，这里不重复设定时器。
   */
  useEffect(() => {
    if (!autoPlay) return
    if (idle || finale || fastOpen) return

    const fire = () => {
      if (autoPlayRef.current) advanceRef.current()
    }

    if (machine.phase === 'revealed') {
      const timer = window.setTimeout(fire, AUTO_CONFIRM_DELAY_MS)
      return () => window.clearTimeout(timer)
    }

    if (machine.phase === 'idle') {
      // 奖品抽完或可抽池空了就自动收工
      if (!machine.hasRemainingSlots || !machine.canStart) {
        setAutoPlay(false)
        return
      }
      const timer = window.setTimeout(fire, AUTO_START_DELAY_MS)
      return () => window.clearTimeout(timer)
    }

    return
  }, [
    autoPlay,
    machine.phase,
    machine.canStart,
    machine.hasRemainingSlots,
    idle,
    finale,
    fastOpen,
  ])

  // 空格键推进；自动播放时按空格改为「停止」，避免手动与自动叠在一起
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return

      if (event.key.toLowerCase() === 'a' && autoPlayAvailable) {
        event.preventDefault()
        toggleAutoPlay()
        return
      }

      if (event.code !== 'Space') return
      event.preventDefault()
      if (autoPlayRef.current) {
        setAutoPlay(false)
        return
      }
      advance()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [advance, autoPlayAvailable, toggleAutoPlay])

  return (
    <AppShell activeRound={roundId}>
      <div className="flex h-full min-h-0 gap-5 p-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <header className="flex shrink-0 items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="rounded-md border border-trae/40 bg-trae/10 px-2 py-1 font-mono text-[0.6875rem] tracking-[0.2em] text-trae">
                  {meta.code}
                </span>
                <h1 className="text-2xl font-semibold tracking-wide text-lab-ink">
                  {meta.title}
                </h1>
              </div>
              <p className="mt-2 text-sm text-lab-dim">
                {meta.subtitle}
                <span className="mx-2 text-lab-faint">|</span>
                名单 {roster.length} 人
                <span className="mx-2 text-lab-faint">|</span>
                可抽池 <span className="font-mono text-trae">{pool.length}</span> 人
              </p>
            </div>
            <PhaseIndicator phase={machine.phase} />
          </header>

          <div className="relative min-h-0 flex-1">
            <BallMachine
              candidates={pool}
              phase={machine.phase}
              winner={machine.winner}
              onEjected={machine.notifyEjected}
            />

            {finale && (
              <FinalPrizeOverlay prizeName={finale.prizeName} remaining={finale.remaining} />
            )}

            {fastOpen && (
              <WinnerWall
                roundId={roundId}
                records={records}
                running={fast.running}
                done={fast.done}
                total={fast.total}
                onClose={() => {
                  fast.reset()
                  setFastOpen(false)
                }}
              />
            )}

            {machine.phase === 'revealed' && machine.winner && !fastOpen && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-8">
                <div className="glass glow-trae rounded-2xl px-10 py-6 text-center">
                  <p className="font-mono text-[0.75rem] tracking-[0.3em] text-trae">
                    {machine.slot?.groupName ?? '本轮'}
                    {machine.slot ? ` · 第 ${machine.slot.groupSlot} 份` : ''}
                  </p>
                  <p className="text-glow mt-2 text-6xl font-semibold tracking-widest text-lab-ink">
                    {machine.winner.name}
                  </p>
                  {machine.winner.no && (
                    <p className="mt-2 font-mono text-sm text-lab-dim">NO. {machine.winner.no}</p>
                  )}
                </div>
              </div>
            )}

            {roster.length === 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="glass rounded-2xl px-8 py-6 text-center">
                  <p className="text-lab-ink">本轮名单为空</p>
                  <p className="mt-1 text-sm text-lab-dim">先导入名单后再开始摇号</p>
                  <Link
                    to={`/round/${roundId}/roster`}
                    className="mt-4 inline-block rounded-lg border border-trae/50 bg-trae/10 px-4 py-2 text-sm text-trae transition-colors hover:bg-trae/20"
                  >
                    去管理名单
                  </Link>
                </div>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={
                autoPlay ||
                fastOpen ||
                Boolean(finale) ||
                (!machine.canStart && machine.phase !== 'revealed')
              }
              onClick={advance}
              className={`rounded-xl border px-8 py-3.5 text-sm font-medium transition-colors ${
                !autoPlay && !fastOpen && !finale && (machine.canStart || machine.phase === 'revealed')
                  ? 'border-trae/55 bg-trae/12 text-trae hover:bg-trae/22'
                  : autoPlay
                    ? 'glow-trae border-trae/60 bg-trae/10 text-trae'
                    : 'cursor-not-allowed border-lab-line text-lab-faint'
              }`}
            >
              {autoPlay && '自动连抽中…'}
              {!autoPlay && finale && '压轴奖提示中…'}
              {!autoPlay && !finale && machine.phase === 'idle' && '开始摇号'}
              {!autoPlay && !finale && busy && '摇号中…'}
              {!autoPlay && !finale && machine.phase === 'revealed' && '确认 · 下一份'}
              {!autoPlay && !finale && (machine.canStart || machine.phase === 'revealed') && (
                <span className="ml-2 font-mono text-[0.6875rem] opacity-60">SPACE</span>
              )}
            </button>

            {autoPlayAvailable && (
              <button
                type="button"
                disabled={Boolean(finale) || fastOpen || (!autoPlay && fast.running)}
                onClick={toggleAutoPlay}
                title="自动连抽（A）"
                className={`flex items-center gap-2 rounded-xl border px-5 py-3.5 text-sm font-medium transition-colors ${
                  autoPlay
                    ? 'glow-trae border-trae/70 bg-trae/20 text-trae'
                    : 'border-trae/55 bg-trae/10 text-trae hover:bg-trae/20'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span
                  className={`size-2 rounded-full ${autoPlay ? 'animate-pulse bg-trae' : 'bg-lab-dim'}`}
                />
                {autoPlay ? '停止自动连抽' : '自动连抽'}
                <span className="font-mono text-[0.6875rem] opacity-70">
                  {autoPlay ? `${records.length}/${totalSlots}` : 'A'}
                </span>
              </button>
            )}

            {fastModeAvailable && (
              <button
                type="button"
                disabled={busy || fast.running || Boolean(finale)}
                onClick={() => {
                  // 一次点击即开墙上滚动并立即连抽，不需要再按空格
                  setFastOpen(true)
                  fast.run()
                }}
                className="rounded-xl border border-trae/55 bg-trae/10 px-5 py-3.5 text-sm font-medium text-trae transition-colors hover:bg-trae/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                快速模式 · 一次抽满
                <span className="ml-2 font-mono text-[0.6875rem] opacity-70">
                  {fast.capacity} 位
                </span>
              </button>
            )}

            {!machine.hasRemainingSlots && machine.phase === 'idle' && (
              <span className="rounded-lg border border-trae/40 px-4 py-2 text-sm text-trae">
                本轮奖品已抽完
              </span>
            )}
            {machine.hasRemainingSlots && pool.length === 0 && (
              <span className="rounded-lg border border-warn/50 px-4 py-2 text-sm text-warn">
                可抽池已空，请补充名单
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={records.length === 0 || busy || fastOpen}
                onClick={() => undoLast(roundId)}
                className="rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:text-lab-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                撤销上一条
              </button>
              <button
                type="button"
                disabled={records.length === 0 || busy || fastOpen}
                onClick={() => {
                  if (window.confirm('确定清空本环节全部中奖记录？此操作不可撤销。')) {
                    resetRound(roundId)
                  }
                }}
                className="rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
              >
                清空本轮结果
              </button>
              <Link
                to={`/round/${roundId}/roster`}
                className="rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:text-lab-ink"
              >
                名单管理
              </Link>
              <Link
                to={`/round/${roundId}/prizes`}
                className="rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:text-lab-ink"
              >
                奖品配置
              </Link>
            </div>
          </footer>
        </div>

        <aside className="flex w-[21.875rem] shrink-0 flex-col gap-4">
          <section className="glass shrink-0 rounded-2xl p-5">
            <p className="font-mono text-[0.6875rem] tracking-[0.22em] text-lab-dim">NOW DRAWING</p>
            {machine.slot ? (
              <>
                <p className="mt-2 text-3xl font-semibold text-lab-ink">
                  {machine.slot.groupName}
                </p>
                <p className="mt-1 font-mono text-sm text-trae">
                  第 {machine.slot.groupSlot} / {machine.slot.groupTotal} 份
                </p>
              </>
            ) : (
              <p className="mt-2 text-lg text-lab-faint">本轮已抽完</p>
            )}
          </section>

          <PrizeRail roundId={roundId} drawnSlotIndexes={drawnSlotIndexes} />
          <WinnerBoard records={records} />
        </aside>
      </div>
    </AppShell>
  )
}