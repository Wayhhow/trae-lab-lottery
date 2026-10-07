import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ROUND_META, ROUND_ORDER } from '@/config/rounds'
import { buildCsv, buildPlainText, copyText, downloadCsv, formatTime, tierOf } from '@/lib/export'
import { useLottery } from '@/store/lottery'
import type { RoundId, WinRecord } from '@/types'

type Scope = RoundId | 'all'

const SCOPES: Scope[] = ['all', ...ROUND_ORDER]

export function LogsPage() {
  const { snapshot } = useLottery()
  const [scope, setScope] = useState<Scope>('all')
  const [notice, setNotice] = useState<string | null>(null)

  // 开奖日志按时间正序，跨环节合并后才是完整的一场活动流水
  const allRecords = useMemo(() => {
    const merged: WinRecord[] = []
    for (const roundId of ROUND_ORDER) {
      merged.push(...snapshot.rounds[roundId].records)
    }
    return merged.sort((a, b) => a.at - b.at)
  }, [snapshot])

  const records = useMemo(
    () => (scope === 'all' ? allRecords : allRecords.filter((record) => record.roundId === scope)),
    [allRecords, scope],
  )

  const scopeLabel = scope === 'all' ? '全部环节' : ROUND_META[scope].title

  const handleCopy = async () => {
    const ok = await copyText(buildPlainText(records))
    setNotice(ok ? `已复制 ${records.length} 条记录到剪贴板` : '复制失败，请检查浏览器剪贴板权限')
  }

  const handleExport = () => {
    const stamp = formatTime(Date.now()).replace(/[: ]/g, '-')
    downloadCsv(`TRAE实验室开奖记录_${scopeLabel}_${stamp}.csv`, buildCsv(records))
    setNotice(`已导出 ${records.length} 条记录`)
  }

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-5 p-5">
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-lab-ink">开奖记录</h1>
            <p className="mt-2 text-sm text-lab-dim">
              每条记录包含开奖时间（精确到秒）、抽奖环节、奖品名称与等级、中奖人完整信息。
              <span className="mx-2 text-lab-faint">|</span>
              当前 {records.length} 条
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SCOPES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setScope(item)
                  setNotice(null)
                }}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  scope === item
                    ? 'border-trae/50 bg-trae/10 text-trae'
                    : 'border-lab-line text-lab-dim hover:text-lab-ink'
                }`}
              >
                {item === 'all' ? '全部环节' : ROUND_META[item].title}
              </button>
            ))}
            <button
              type="button"
              onClick={handleCopy}
              disabled={records.length === 0}
              className="rounded-lg border border-trae/50 bg-trae/10 px-4 py-2 text-sm text-trae transition-colors hover:bg-trae/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              一键复制
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={records.length === 0}
              className="rounded-lg border border-trae/50 bg-trae/10 px-4 py-2 text-sm text-trae transition-colors hover:bg-trae/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              导出 CSV
            </button>
            <Link
              to="/overview"
              className="rounded-lg border border-lab-line px-4 py-2 text-sm text-lab-dim transition-colors hover:text-lab-ink"
            >
              返回总览
            </Link>
          </div>
        </header>

        {notice && (
          <p className="shrink-0 rounded-lg border border-trae/40 bg-trae/10 px-4 py-2.5 text-sm text-trae">
            {notice}
          </p>
        )}

        <section className="glass flex min-h-0 flex-1 flex-col rounded-2xl p-5">
          <div className="grid shrink-0 grid-cols-[4rem_12rem_7rem_minmax(0,1fr)_6rem_6rem] gap-3 border-b border-lab-line pb-2.5 font-mono text-[0.6875rem] tracking-wider text-lab-faint">
            <span>序号</span>
            <span>开奖时间</span>
            <span>环节</span>
            <span>奖品 / 等级</span>
            <span>编号</span>
            <span>姓名</span>
          </div>

          {records.length === 0 ? (
            <p className="py-16 text-center text-sm text-lab-faint">该范围内暂无开奖记录</p>
          ) : (
            <ul className="no-scrollbar mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
              {records.map((record, index) => (
                <li
                  key={`${record.roundId}-${record.slotIndex}-${record.candidateId}`}
                  className="grid grid-cols-[4rem_12rem_7rem_minmax(0,1fr)_6rem_6rem] items-center gap-3 rounded-lg border-b border-lab-line/50 px-1 py-2 last:border-b-0"
                >
                  <span className="font-mono text-[0.75rem] text-lab-faint">{index + 1}</span>
                  <span className="font-mono text-[0.8125rem] text-lab-dim">
                    {formatTime(record.at)}
                  </span>
                  <span className="truncate text-sm text-lab-dim">
                    {ROUND_META[record.roundId].title}
                  </span>
                  <span className="min-w-0 truncate text-sm text-lab-ink">
                    {record.groupName}
                    <span className="ml-2 rounded-full border border-trae/35 px-2 py-0.5 text-[0.6875rem] text-trae">
                      {tierOf(record)}
                    </span>
                  </span>
                  <span className="font-mono text-[0.75rem] text-lab-dim">
                    {record.candidateNo || '—'}
                  </span>
                  <span className="truncate text-sm text-lab-ink">{record.candidateName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}