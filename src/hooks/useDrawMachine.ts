import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Candidate, LotteryPhase, PrizeSlot, RoundId, WinRecord } from '@/types'
import { getPrizeGroups, prizeTierOf } from '@/config/rounds'
import { currentSlot } from '@/lib/prize'
import { pickOne } from '@/lib/random'
import { useLottery } from '@/store/lottery'

/** 摇号容器翻滚时长 */
const SPIN_MS = 3200

interface Pending {
  slot: PrizeSlot
  candidate: Candidate
}

export interface DrawMachine {
  phase: LotteryPhase
  /** 当前正在抽取的奖品槽位 */
  slot: PrizeSlot | null
  /** 已定下的中奖者；在 revealed 之前不应提前展示 */
  winner: Candidate | null
  /** 本轮可抽池大小 */
  poolSize: number
  /** 是否还有未抽完的奖品 */
  hasRemainingSlots: boolean
  canStart: boolean
  start: () => void
  /**
   * 物理层报告目标球已出球。
   * ejecting → revealed 由它驱动，而不是定时器：
   * 出球耗时由物理决定，用固定时长会导致中奖名提前弹出。
   */
  notifyEjected: () => void
  /** 把中奖者写入结果并回到待机 */
  confirm: () => void
}

/**
 * 抽奖状态机。
 * 关键点：中奖者在 start() 的同一帧就用 crypto 定好，
 * 后续的翻滚与出球只是把这个既定结果演出来。
 */
export function useDrawMachine(roundId: RoundId): DrawMachine {
  const { poolOf, drawnSlotIndexesOf, commitWin } = useLottery()

  const groups = useMemo(() => getPrizeGroups(roundId), [roundId])
  const pool = poolOf(roundId)
  const drawnSlotIndexes = drawnSlotIndexesOf(roundId)
  const slot = useMemo(() => currentSlot(groups, drawnSlotIndexes), [groups, drawnSlotIndexes])

  const [phase, setPhase] = useState<LotteryPhase>('idle')
  const [pending, setPending] = useState<Pending | null>(null)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  // 名单或奖品被改动导致当前槽位失效时，回到待机，避免卡在中间态
  useEffect(() => {
    if (phase !== 'idle' && (!slot || pool.length === 0)) {
      clearTimers()
      setPending(null)
      setPhase('idle')
    }
  }, [phase, slot, pool.length, clearTimers])

  const start = useCallback(() => {
    if (phase !== 'idle' || !slot || pool.length === 0) return

    // 结果先定：此刻中奖者已经确定，剩下的只是表演
    const candidate = pickOne(pool)
    setPending({ slot, candidate })

    clearTimers()
    setPhase('spinning')
    timers.current.push(window.setTimeout(() => setPhase('ejecting'), SPIN_MS))
  }, [phase, slot, pool, clearTimers])

  const notifyEjected = useCallback(() => {
    setPhase((current) => (current === 'ejecting' ? 'revealed' : current))
  }, [])

  const confirm = useCallback(() => {
    if (!pending) return
    const record: WinRecord = {
      slotIndex: pending.slot.slotIndex,
      groupId: pending.slot.groupId,
      groupName: pending.slot.groupName,
      prizeTier: prizeTierOf(groups, pending.slot.groupId),
      roundId,
      candidateId: pending.candidate.id,
      candidateNo: pending.candidate.no,
      candidateName: pending.candidate.name,
      at: Date.now(),
    }
    commitWin(roundId, record)
    clearTimers()
    setPending(null)
    setPhase('idle')
  }, [pending, groups, commitWin, roundId, clearTimers])

  return {
    phase,
    slot,
    winner: pending?.candidate ?? null,
    poolSize: pool.length,
    hasRemainingSlots: slot !== null,
    canStart: phase === 'idle' && slot !== null && pool.length > 0,
    start,
    notifyEjected,
    confirm,
  }
}