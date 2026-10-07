import type { PrizeGroup, PrizeSlot } from '@/types'

/** 把奖品组按配置顺序展开成一个个待抽槽位：徽章×2 → 徽章#1、徽章#2 → 笔记本#1 … */
export function expandPrizeSlots(groups: readonly PrizeGroup[]): PrizeSlot[] {
  const slots: PrizeSlot[] = []
  for (const group of groups) {
    for (let i = 1; i <= group.count; i += 1) {
      slots.push({
        slotIndex: slots.length,
        groupId: group.id,
        groupName: group.name,
        groupSlot: i,
        groupTotal: group.count,
      })
    }
  }
  return slots
}

/** 尚未抽出中奖者的槽位 */
export function remainingSlots(
  groups: readonly PrizeGroup[],
  drawnSlotIndexes: readonly number[],
): PrizeSlot[] {
  const drawn = new Set(drawnSlotIndexes)
  return expandPrizeSlots(groups).filter((slot) => !drawn.has(slot.slotIndex))
}

/** 当前即将抽取的槽位，全部抽完则为 null */
export function currentSlot(
  groups: readonly PrizeGroup[],
  drawnSlotIndexes: readonly number[],
): PrizeSlot | null {
  return remainingSlots(groups, drawnSlotIndexes)[0] ?? null
}

/** 按奖品组的组织方式汇总当前进度，用于界面展示 */
export interface GroupProgress {
  group: PrizeGroup
  drawn: number
}

export function groupProgress(
  groups: readonly PrizeGroup[],
  drawnSlotIndexes: readonly number[],
): GroupProgress[] {
  const remaining = remainingSlots(groups, drawnSlotIndexes)
  const remainingPerGroup = new Map<string, number>()
  for (const slot of remaining) {
    remainingPerGroup.set(slot.groupId, (remainingPerGroup.get(slot.groupId) ?? 0) + 1)
  }
  return groups.map((group) => ({
    group,
    drawn: group.count - (remainingPerGroup.get(group.id) ?? 0),
  }))
}