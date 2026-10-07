import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoundId, WinRecord } from '@/types'
import { getPrizeGroups, prizeTierOf } from '@/config/rounds'
import { remainingSlots } from '@/lib/prize'
import { shuffled } from '@/lib/random'
import { useLottery } from '@/store/lottery'

/** 每 80ms 落一位，20 位约 1.6 秒跑完，视觉上像名字不断涌上墙 */
const STEP_MS = 80

export interface FastDraw {
  running: boolean
  total: number
  done: number
  /** 可抽的中奖位数量（奖品位与可抽池取小） */
  capacity: number
  run: () => void
  reset: () => void
}

/**
 * 安慰轮快速模式。
 *
 * 与单抽共用同一套公平性约束：先用 crypto 一次性洗牌定下全部中奖者，
 * 再逐个落库并上墙。不经过物理层，所以 20 连抽不会有任何卡顿。
 */
export function useFastDraw(roundId: RoundId): FastDraw {
  const { poolOf, drawnSlotIndexesOf, commitWins } = useLottery()

  const groups = useMemo(() => getPrizeGroups(roundId), [roundId])
  const pool = poolOf(roundId)
  const drawnSlotIndexes = drawnSlotIndexesOf(roundId)

  const slots = useMemo(
    () => remainingSlots(groups, drawnSlotIndexes),
    [groups, drawnSlotIndexes],
  )
  const capacity = Math.min(slots.length, pool.length)

  const [state, setState] = useState({ running: false, total: 0, done: 0 })
  const timers = useRef<number[]>([])
  const runningRef = useRef(false)

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const run = useCallback(() => {
    if (runningRef.current) return
    const pending = remainingSlots(groups, drawnSlotIndexesOf(roundId))
    const poolNow = poolOf(roundId)
    const count = Math.min(pending.length, poolNow.length)
    if (count === 0) return

    // 结果先定：一次洗牌定下全部中奖者，后续只是把它们逐个演出来
    const order = shuffled(poolNow)
    const picks = pending.slice(0, count).map((slot, index) => ({
      slot,
      candidate: order[index]!,
    }))

    runningRef.current = true
    setState({ running: true, total: picks.length, done: 0 })
    clearTimers()

    picks.forEach((pick, index) => {
      timers.current.push(
        window.setTimeout(() => {
          const record: WinRecord = {
            slotIndex: pick.slot.slotIndex,
            groupId: pick.slot.groupId,
            groupName: pick.slot.groupName,
            prizeTier: prizeTierOf(groups, pick.slot.groupId),
            roundId,
            candidateId: pick.candidate.id,
            candidateNo: pick.candidate.no,
            candidateName: pick.candidate.name,
            at: Date.now(),
          }
          commitWins(roundId, [record])
          const done = index + 1
          if (done >= picks.length) runningRef.current = false
          setState({ running: done < picks.length, total: picks.length, done })
        }, index * STEP_MS),
      )
    })
  }, [groups, roundId, poolOf, drawnSlotIndexesOf, commitWins, clearTimers])

  const reset = useCallback(() => {
    clearTimers()
    runningRef.current = false
    setState({ running: false, total: 0, done: 0 })
  }, [clearTimers])

  return {
    running: state.running,
    total: state.total,
    done: state.done,
    capacity,
    run,
    reset,
  }
}