/** 三个独立抽奖环节的标识 */
export type RoundId = 'likes' | 'onsite' | 'consolation'

/** 摇号状态机：待机 → 摇号中 → 出球 → 中奖展示 */
export type LotteryPhase = 'idle' | 'spinning' | 'ejecting' | 'revealed'

/** 候选人。no 为可选的现场编号，id 是稳定主键（导入后不随编辑变化） */
export interface Candidate {
  id: string
  no: string
  name: string
}

/** 奖品组：一个组包含若干份同名奖品 */
export interface PrizeGroup {
  id: string
  name: string
  count: number
  /** 奖品等级，用于开奖记录留档；未配置时按组序回退为「第 N 档」 */
  tier?: string
  /** 压轴奖品：抽取前触发全屏 FINAL PRIZE 动效 */
  final?: boolean
}

/** 奖品组展开后的单个槽位，决定抽取顺序 */
export interface PrizeSlot {
  slotIndex: number
  groupId: string
  groupName: string
  /** 组内第几份，从 1 开始 */
  groupSlot: number
  groupTotal: number
}

/** 一条中奖记录，同时作为开奖日志的最小单元 */
export interface WinRecord {
  slotIndex: number
  groupId: string
  groupName: string
  /** 奖品等级 */
  prizeTier: string
  /** 所属抽奖环节 */
  roundId: RoundId
  candidateId: string
  candidateNo: string
  candidateName: string
  at: number
}

/** 单个环节的可持久化状态 */
export interface RoundSnapshot {
  roster: Candidate[]
  records: WinRecord[]
}

/** 落盘的完整结构 */
export interface LotterySnapshot {
  version: number
  rounds: Record<RoundId, RoundSnapshot>
}