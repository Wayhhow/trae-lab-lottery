import type { PrizeGroup, RoundId } from '@/types'

/** 环节元信息 */
export interface RoundMeta {
  id: RoundId
  title: string
  code: string
  subtitle: string
  /** 预期候选人数，仅用于界面提示与进度展示 */
  expectedCandidates: number
  /** 名单来源：独立名单 / 由现场轮未中奖者推导 */
  rosterSource: 'own' | 'onsite-losers'
}

export const ROUND_ORDER: RoundId[] = ['likes', 'onsite', 'consolation']

export const ROUND_META: Record<RoundId, RoundMeta> = {
  likes: {
    id: 'likes',
    title: '集赞轮',
    code: 'R-01',
    subtitle: '16 位候选人 · 10 份周边',
    expectedCandidates: 16,
    rosterSource: 'own',
  },
  onsite: {
    id: 'onsite',
    title: '现场轮',
    code: 'R-02',
    subtitle: '100 位候选人 · 20 份周边',
    expectedCandidates: 100,
    rosterSource: 'own',
  },
  consolation: {
    id: 'consolation',
    title: '安慰轮',
    code: 'R-03',
    subtitle: '现场轮未中奖者 · 20 份贴纸',
    expectedCandidates: 80,
    rosterSource: 'onsite-losers',
  },
}

/**
 * 奖品配置的默认静态常量。
 * 顺序即抽取顺序：数组靠前的奖品组先抽完，再进入下一组。
 */
export const DEFAULT_PRIZE_GROUPS: Record<RoundId, PrizeGroup[]> = {
  likes: [
    { id: 'badge', name: '徽章', count: 2, tier: '参与奖' },
    { id: 'notebook', name: '笔记本', count: 2, tier: '参与奖' },
    { id: 'mug', name: '马克杯', count: 2, tier: '参与奖' },
    { id: 'keycap', name: '键帽', count: 2, tier: '参与奖' },
    { id: 'tote', name: '单肩包', count: 2, tier: '进阶奖' },
  ],
  onsite: [
    { id: 'badge', name: '徽章', count: 3, tier: '参与奖' },
    { id: 'notebook', name: '笔记本', count: 3, tier: '参与奖' },
    { id: 'mug', name: '马克杯', count: 3, tier: '参与奖' },
    { id: 'keycap', name: '键帽', count: 3, tier: '参与奖' },
    { id: 'tote', name: '单肩包', count: 3, tier: '进阶奖' },
    { id: 'bucket-hat', name: '渔夫帽', count: 3, tier: '进阶奖' },
    { id: 'tablet-sleeve', name: '平板电脑包', count: 2, tier: '压轴奖', final: true },
  ],
  consolation: [{ id: 'sticker', name: '贴纸', count: 20, tier: '安慰奖' }],
}

/** 奖品等级：优先用配置值，否则按组序回退 */
export function prizeTierOf(groups: readonly PrizeGroup[], groupId: string): string {
  const index = groups.findIndex((group) => group.id === groupId)
  if (index < 0) return '未定级'
  return groups[index]?.tier ?? `第 ${index + 1} 档`
}

/** 该奖品组是否为压轴奖品 */
export function isFinalGroup(groups: readonly PrizeGroup[], groupId: string): boolean {
  return groups.find((group) => group.id === groupId)?.final === true
}

const OVERRIDE_KEY = 'trae-lab-lottery:prize-overrides:v1'

type PrizeOverrideMap = Partial<Record<RoundId, PrizeGroup[]>>

function readOverrides(): PrizeOverrideMap {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY)
    return raw ? (JSON.parse(raw) as PrizeOverrideMap) : {}
  } catch {
    return {}
  }
}

/**
 * 奖品配置读取接口。后续要做「现场改奖品」时，
 * 只需调用 setPrizeGroupsOverride，消费方无需改动。
 */
export function getPrizeGroups(roundId: RoundId): PrizeGroup[] {
  const overridden = readOverrides()[roundId]
  return overridden?.length ? overridden : DEFAULT_PRIZE_GROUPS[roundId]
}

/** 奖品配置写入接口，传 null 恢复默认常量 */
export function setPrizeGroupsOverride(roundId: RoundId, groups: PrizeGroup[] | null): void {
  const next = readOverrides()
  if (groups?.length) {
    next[roundId] = groups
  } else {
    delete next[roundId]
  }
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next))
}

/** 汇总一个环节的奖品总份数 */
export function totalPrizeCount(groups: PrizeGroup[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0)
}