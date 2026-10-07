import { useEffect, useRef } from 'react'
import { ROUND_META } from '@/config/rounds'
import { tierOf } from '@/lib/export'
import type { RoundId, WinRecord } from '@/types'

interface WinnerWallProps {
  roundId: RoundId
  records: WinRecord[]
  running: boolean
  done: number
  total: number
  onClose: () => void
}

/**
 * 中奖名单「上墙」滚动展示。
 * 新记录从底部涌入，容器自动跟随，形成名字不断上墙的效果。
 */
export function WinnerWall({
  roundId,
  records,
  running,
  done,
  total,
  onClose,
}: WinnerWallProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scrollerRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [records.length])

  const meta = ROUND_META[roundId]

  return (
    <div className="glass scanlines absolute inset-0 z-40 flex flex-col overflow-hidden rounded-2xl">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-lab-line px-6 py-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-trae/40 bg-trae/10 px-2 py-1 font-mono text-[0.6875rem] tracking-[0.2em] text-trae">
              FAST MODE
            </span>
            <h2 className="text-lg font-semibold text-lab-ink">
              {meta.title} · 快速抽奖
            </h2>
          </div>
          <p className="mt-1.5 font-mono text-[0.8125rem] text-lab-dim">
            {running ? '抽取中' : '已完成'} · {done} / {total}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={running}
          className="rounded-lg border border-lab-line px-4 py-2 text-sm text-lab-dim transition-colors hover:text-lab-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          关闭
        </button>
      </header>

      <div className="h-1 shrink-0 bg-lab-panel-2">
        <div
          className="h-full bg-trae transition-[width] duration-100"
          style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
        />
      </div>

      {records.length === 0 ? (
        <p className="grid flex-1 place-items-center text-sm text-lab-faint">等待开始…</p>
      ) : (
        <div
          ref={scrollerRef}
          className="no-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5 overflow-y-auto p-5"
        >
          {records.map((record, index) => (
            <div
              key={record.candidateId}
              className="wall-tile flex items-center gap-3 rounded-xl border border-lab-line bg-lab-panel/70 px-3.5 py-2.5"
              style={{ animationDelay: `${Math.min(index, 6) * 12}ms` }}
            >
              <span className="w-9 shrink-0 font-mono text-[0.6875rem] text-lab-faint">
                {record.candidateNo || '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-lab-ink">
                {record.candidateName}
              </span>
              <span className="shrink-0 rounded-full border border-trae/35 px-2 py-0.5 text-[0.6875rem] text-trae">
                {tierOf(record)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}