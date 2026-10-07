import { useMemo } from 'react'
import type { RoundId } from '@/types'
import { getPrizeGroups, totalPrizeCount } from '@/config/rounds'
import { currentSlot, groupProgress } from '@/lib/prize'

interface PrizeRailProps {
  roundId: RoundId
  drawnSlotIndexes: number[]
}

/** 奖品顺序队列：按配置顺序展示各组进度，并标出当前正在抽的那一份 */
export function PrizeRail({ roundId, drawnSlotIndexes }: PrizeRailProps) {
  const groups = useMemo(() => getPrizeGroups(roundId), [roundId])
  const progress = useMemo(
    () => groupProgress(groups, drawnSlotIndexes),
    [groups, drawnSlotIndexes],
  )
  const active = useMemo(
    () => currentSlot(groups, drawnSlotIndexes),
    [groups, drawnSlotIndexes],
  )

  const total = totalPrizeCount(groups)
  const drawnCount = drawnSlotIndexes.length
  const percent = total === 0 ? 0 : Math.round((drawnCount / total) * 100)

  return (
    <section className="glass flex min-h-0 flex-col rounded-2xl p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[0.9375rem] font-semibold text-lab-ink">奖品顺序</h2>
        <span className="font-mono text-[0.75rem] text-lab-dim">
          {drawnCount}/{total}
        </span>
      </header>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-lab-panel-2">
        <div
          className="h-full rounded-full bg-trae transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="no-scrollbar mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {progress.map(({ group, drawn }) => {
          const isActive = active?.groupId === group.id
          const done = drawn >= group.count
          return (
            <li
              key={group.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                isActive
                  ? 'border-trae/55 bg-trae/10'
                  : done
                    ? 'border-lab-line/60 opacity-55'
                    : 'border-lab-line'
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-md font-mono text-[0.6875rem] ${
                  isActive
                    ? 'bg-trae text-trae-ink'
                    : done
                      ? 'bg-lab-line text-lab-dim'
                      : 'bg-lab-panel-2 text-lab-dim'
                }`}
              >
                {done ? '✓' : drawn + 1}
              </span>
              <span
                className={`flex-1 truncate text-sm ${isActive ? 'text-trae' : 'text-lab-ink'}`}
              >
                {group.name}
              </span>
              <span className="font-mono text-[0.75rem] text-lab-dim">
                {drawn}/{group.count}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}