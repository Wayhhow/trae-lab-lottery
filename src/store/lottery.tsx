import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import type { Candidate, LotterySnapshot, RoundId, WinRecord } from '@/types'
import { loadSnapshot, saveSnapshot } from '@/lib/storage'

type Action =
  | { type: 'setRoster'; roundId: RoundId; roster: Candidate[] }
  | { type: 'addCandidate'; roundId: RoundId; candidate: Candidate }
  | {
      type: 'updateCandidate'
      roundId: RoundId
      candidateId: string
      patch: Partial<Pick<Candidate, 'no' | 'name'>>
    }
  | { type: 'removeCandidate'; roundId: RoundId; candidateId: string }
  | { type: 'commitWin'; roundId: RoundId; record: WinRecord }
  | { type: 'commitWins'; roundId: RoundId; records: WinRecord[] }
  | { type: 'undoLast'; roundId: RoundId }
  | { type: 'resetRound'; roundId: RoundId }

function updateRound(
  snapshot: LotterySnapshot,
  roundId: RoundId,
  updater: (round: LotterySnapshot['rounds'][RoundId]) => LotterySnapshot['rounds'][RoundId],
): LotterySnapshot {
  return {
    ...snapshot,
    rounds: {
      ...snapshot.rounds,
      [roundId]: updater(snapshot.rounds[roundId]),
    },
  }
}

function reducer(snapshot: LotterySnapshot, action: Action): LotterySnapshot {
  switch (action.type) {
    case 'setRoster':
      return updateRound(snapshot, action.roundId, (round) => ({
        ...round,
        roster: action.roster,
      }))

    case 'addCandidate':
      return updateRound(snapshot, action.roundId, (round) => ({
        ...round,
        roster: [...round.roster, action.candidate],
      }))

    case 'updateCandidate':
      return updateRound(snapshot, action.roundId, (round) => ({
        ...round,
        roster: round.roster.map((candidate) =>
          candidate.id === action.candidateId ? { ...candidate, ...action.patch } : candidate,
        ),
      }))

    case 'removeCandidate':
      return updateRound(snapshot, action.roundId, (round) => ({
        ...round,
        roster: round.roster.filter((candidate) => candidate.id !== action.candidateId),
        // 同步剔除该候选人的中奖记录，避免留下悬空引用
        records: round.records.filter((record) => record.candidateId !== action.candidateId),
      }))

    case 'commitWin': {
      const { roundId, record } = action
      // 同一环节内中奖者不可重复
      if (snapshot.rounds[roundId].records.some((item) => item.candidateId === record.candidateId)) {
        return snapshot
      }
      return updateRound(snapshot, roundId, (round) => ({
        ...round,
        records: [...round.records, record],
      }))
    }

    case 'commitWins': {
      // 批量落库（安慰轮快速模式）：同批内与已有记录一并去重
      const seen = new Set(
        snapshot.rounds[action.roundId].records.map((item) => item.candidateId),
      )
      const fresh: WinRecord[] = []
      for (const record of action.records) {
        if (seen.has(record.candidateId)) continue
        seen.add(record.candidateId)
        fresh.push(record)
      }
      if (fresh.length === 0) return snapshot
      return updateRound(snapshot, action.roundId, (round) => ({
        ...round,
        records: [...round.records, ...fresh],
      }))
    }

    case 'undoLast':
      return updateRound(snapshot, action.roundId, (round) => ({
        ...round,
        records: round.records.slice(0, -1),
      }))

    case 'resetRound':
      return updateRound(snapshot, action.roundId, (round) => ({ ...round, records: [] }))

    default:
      return snapshot
  }
}

interface LotteryContextValue {
  snapshot: LotterySnapshot
  rosterOf: (roundId: RoundId) => Candidate[]
  recordsOf: (roundId: RoundId) => WinRecord[]
  /** 尚未中奖的候选人，即本轮可抽池 */
  poolOf: (roundId: RoundId) => Candidate[]
  drawnSlotIndexesOf: (roundId: RoundId) => number[]
  setRoster: (roundId: RoundId, roster: Candidate[]) => void
  addCandidate: (roundId: RoundId, candidate: Candidate) => void
  updateCandidate: (
    roundId: RoundId,
    candidateId: string,
    patch: Partial<Pick<Candidate, 'no' | 'name'>>,
  ) => void
  removeCandidate: (roundId: RoundId, candidateId: string) => void
  commitWin: (roundId: RoundId, record: WinRecord) => void
  /** 批量提交，供安慰轮快速模式使用 */
  commitWins: (roundId: RoundId, records: WinRecord[]) => void
  undoLast: (roundId: RoundId) => void
  resetRound: (roundId: RoundId) => void
}

const LotteryContext = createContext<LotteryContextValue | null>(null)

/**
 * 安慰轮与现场轮共用同一份名单：
 * 现场轮那 100 人里还没中奖的，就是安慰轮的候选池。
 * 推导而非复制，现场轮一抽完，安慰轮自动就只剩 80 人，不需要任何手动同步。
 */
function consolationSource(snapshot: LotterySnapshot): Candidate[] {
  const { roster, records } = snapshot.rounds.onsite
  const won = new Set(records.map((record) => record.candidateId))
  return roster.filter((candidate) => !won.has(candidate.id))
}

/** 取某个环节的名单。安慰轮是推导出来的，其余用自己的那份 */
function rosterFor(snapshot: LotterySnapshot, roundId: RoundId): Candidate[] {
  return roundId === 'consolation' ? consolationSource(snapshot) : snapshot.rounds[roundId].roster
}

export function LotteryProvider({ children }: { children: ReactNode }) {
  const [snapshot, dispatch] = useReducer(reducer, undefined, loadSnapshot)

  // 每次状态变化同步落盘，刷新或意外关闭后可直接恢复
  useEffect(() => {
    saveSnapshot(snapshot)
  }, [snapshot])

  const rosterOf = useCallback((roundId: RoundId) => rosterFor(snapshot, roundId), [snapshot])

  const recordsOf = useCallback((roundId: RoundId) => snapshot.rounds[roundId].records, [snapshot])

  const poolOf = useCallback(
    (roundId: RoundId) => {
      const records = snapshot.rounds[roundId].records
      const won = new Set(records.map((record) => record.candidateId))
      return rosterFor(snapshot, roundId).filter((candidate) => !won.has(candidate.id))
    },
    [snapshot],
  )

  const drawnSlotIndexesOf = useCallback(
    (roundId: RoundId) => snapshot.rounds[roundId].records.map((record) => record.slotIndex),
    [snapshot],
  )

  const setRoster = useCallback(
    (roundId: RoundId, roster: Candidate[]) => dispatch({ type: 'setRoster', roundId, roster }),
    [],
  )

  const addCandidate = useCallback(
    (roundId: RoundId, candidate: Candidate) =>
      dispatch({ type: 'addCandidate', roundId, candidate }),
    [],
  )

  const updateCandidate = useCallback(
    (roundId: RoundId, candidateId: string, patch: Partial<Pick<Candidate, 'no' | 'name'>>) =>
      dispatch({ type: 'updateCandidate', roundId, candidateId, patch }),
    [],
  )

  const removeCandidate = useCallback(
    (roundId: RoundId, candidateId: string) =>
      dispatch({ type: 'removeCandidate', roundId, candidateId }),
    [],
  )

  const commitWin = useCallback(
    (roundId: RoundId, record: WinRecord) => dispatch({ type: 'commitWin', roundId, record }),
    [],
  )

  const commitWins = useCallback(
    (roundId: RoundId, records: WinRecord[]) =>
      dispatch({ type: 'commitWins', roundId, records }),
    [],
  )

  const undoLast = useCallback((roundId: RoundId) => dispatch({ type: 'undoLast', roundId }), [])

  const resetRound = useCallback((roundId: RoundId) => dispatch({ type: 'resetRound', roundId }), [])

  const value = useMemo<LotteryContextValue>(
    () => ({
      snapshot,
      rosterOf,
      recordsOf,
      poolOf,
      drawnSlotIndexesOf,
      setRoster,
      addCandidate,
      updateCandidate,
      removeCandidate,
      commitWin,
      commitWins,
      undoLast,
      resetRound,
    }),
    [
      snapshot,
      rosterOf,
      recordsOf,
      poolOf,
      drawnSlotIndexesOf,
      setRoster,
      addCandidate,
      updateCandidate,
      removeCandidate,
      commitWin,
      commitWins,
      undoLast,
      resetRound,
    ],
  )

  return <LotteryContext.Provider value={value}>{children}</LotteryContext.Provider>
}

export function useLottery(): LotteryContextValue {
  const context = useContext(LotteryContext)
  if (!context) {
    throw new Error('useLottery 必须在 LotteryProvider 内部使用')
  }
  return context
}