import type { Candidate, LotterySnapshot, RoundId, RoundSnapshot, WinRecord } from '@/types'
import { ROUND_ORDER } from '@/config/rounds'
import { LIKES_ROSTER, ONSITE_ROSTER, builtinCandidates } from '@/data/rosters'
import type { BuiltinName } from '@/data/rosters'

const STORAGE_KEY = 'trae-lab-lottery:state:v1'
const SNAPSHOT_VERSION = 1

/** 环节 → 内置名单来源。安慰轮不预填，它由现场轮推导 */
const BUILTIN_SOURCES: Partial<Record<RoundId, readonly BuiltinName[]>> = {
  likes: LIKES_ROSTER,
  onsite: ONSITE_ROSTER,
}

/**
 * 用内置名单预填 / 刷新本地快照，只在这一轮"干净"时才动：
 * - 有抽奖记录 → 绝不改动，保护现场结果
 * - 名单为空 → 预填（首次打开）
 * - 名单里的人全都在内置名单上、只是人数少于内置 → 判定为内置名单补录过的旧快照，整体刷新
 *   （例如集赞轮从 16 人补录到 18 人，老访客打开即可自动跟上）
 * - 其余情况（手工增删改过）→ 保持原样
 */
function withBuiltinRoster(round: RoundSnapshot, source: readonly BuiltinName[]): RoundSnapshot {
  if (round.records.length > 0) return round
  if (round.roster.length === 0) return { ...round, roster: builtinCandidates(source) }

  const sourceNames = new Set(source.map((item) => item.name))
  const untouched = round.roster.every((candidate) => sourceNames.has(candidate.name))
  if (untouched && round.roster.length !== source.length) {
    return { ...round, roster: builtinCandidates(source) }
  }
  return round
}

function withBuiltins(snapshot: LotterySnapshot): LotterySnapshot {
  const rounds = { ...snapshot.rounds }
  for (const roundId of ROUND_ORDER) {
    const source = BUILTIN_SOURCES[roundId]
    if (!source) continue
    rounds[roundId] = withBuiltinRoster(rounds[roundId], source)
  }
  return { ...snapshot, rounds }
}

function emptyRound(): RoundSnapshot {
  return { roster: [], records: [] }
}

/** 三个环节各自独立的空白状态 */
export function emptyRounds(): Record<RoundId, RoundSnapshot> {
  return {
    likes: emptyRound(),
    onsite: emptyRound(),
    consolation: emptyRound(),
  }
}

export function createEmptySnapshot(): LotterySnapshot {
  return { version: SNAPSHOT_VERSION, rounds: emptyRounds() }
}

function isCandidate(value: unknown): value is Candidate {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.no === 'string'
  )
}

function readRecord(value: unknown, roundId: RoundId): WinRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const valid =
    typeof record.slotIndex === 'number' &&
    typeof record.groupId === 'string' &&
    typeof record.groupName === 'string' &&
    typeof record.candidateId === 'string' &&
    typeof record.candidateName === 'string' &&
    typeof record.at === 'number'
  if (!valid) return null

  // prizeTier / roundId 是后加的字段，旧数据缺失时补默认值而不是丢弃整条记录
  return {
    slotIndex: record.slotIndex as number,
    groupId: record.groupId as string,
    groupName: record.groupName as string,
    prizeTier: typeof record.prizeTier === 'string' ? record.prizeTier : '',
    roundId,
    candidateId: record.candidateId as string,
    candidateNo: typeof record.candidateNo === 'string' ? record.candidateNo : '',
    candidateName: record.candidateName as string,
    at: record.at as number,
  }
}

function readRound(roundId: RoundId, value: unknown): RoundSnapshot {
  if (typeof value !== 'object' || value === null) return emptyRound()
  const round = value as Record<string, unknown>
  return {
    roster: Array.isArray(round.roster) ? round.roster.filter(isCandidate) : [],
    records: Array.isArray(round.records)
      ? round.records
          .map((record) => readRecord(record, roundId))
          .filter((record): record is WinRecord => record !== null)
      : [],
  }
}

/**
 * 从 localStorage 恢复状态。
 * 任何解析失败都回退到空白状态，避免现场因脏数据白屏。
 */
export function loadSnapshot(): LotterySnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return withBuiltins(createEmptySnapshot())

    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version !== SNAPSHOT_VERSION) return withBuiltins(createEmptySnapshot())

    const rounds = (parsed.rounds ?? {}) as Record<string, unknown>
    const restored = emptyRounds()
    for (const roundId of ROUND_ORDER) {
      restored[roundId] = readRound(roundId, rounds[roundId])
    }
    return withBuiltins({ version: SNAPSHOT_VERSION, rounds: restored })
  } catch {
    return withBuiltins(createEmptySnapshot())
  }
}

export function saveSnapshot(snapshot: LotterySnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // 存储不可用时静默降级，抽奖流程不应被阻断
  }
}