import type { WinRecord } from '@/types'

interface WinnerBoardProps {
  records: WinRecord[]
}

/** 中奖名单：最新一条置顶，便于现场唱名时对照 */
export function WinnerBoard({ records }: WinnerBoardProps) {
  const latestFirst = [...records].reverse()

  return (
    <section className="glass flex min-h-0 flex-1 flex-col rounded-2xl p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[0.9375rem] font-semibold text-lab-ink">中奖名单</h2>
        <span className="font-mono text-[0.75rem] text-lab-dim">{records.length} 人</span>
      </header>

      {latestFirst.length === 0 ? (
        <p className="mt-4 text-sm text-lab-faint">尚无中奖记录</p>
      ) : (
        <ul className="no-scrollbar mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {latestFirst.map((record) => (
            <li
              key={`${record.slotIndex}-${record.candidateId}`}
              className="flex items-center gap-3 rounded-lg border border-lab-line px-3 py-2"
            >
              <span className="w-10 shrink-0 font-mono text-[0.6875rem] text-lab-dim">
                {record.candidateNo || '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-lab-ink">
                {record.candidateName}
              </span>
              <span className="shrink-0 rounded-full border border-trae/35 px-2 py-0.5 text-[0.6875rem] text-trae">
                {record.groupName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}