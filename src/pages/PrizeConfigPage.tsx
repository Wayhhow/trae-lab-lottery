import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import {
  DEFAULT_PRIZE_GROUPS,
  ROUND_META,
  getPrizeGroups,
  setPrizeGroupsOverride,
  totalPrizeCount,
} from '@/config/rounds'
import { expandPrizeSlots } from '@/lib/prize'
import { useLottery } from '@/store/lottery'
import type { PrizeGroup, RoundId } from '@/types'

const ROUND_IDS: RoundId[] = ['likes', 'onsite', 'consolation']

function isRoundId(value: string | undefined): value is RoundId {
  return value !== undefined && ROUND_IDS.includes(value as RoundId)
}

export function PrizeConfigPage() {
  const params = useParams<{ roundId: string }>()
  const roundId = params.roundId

  if (!isRoundId(roundId)) {
    return <Navigate to="/overview" replace />
  }

  return <PrizeConfigStage roundId={roundId} />
}

function PrizeConfigStage({ roundId }: { roundId: RoundId }) {
  const { rosterOf, recordsOf } = useLottery()
  const meta = ROUND_META[roundId]
  const roster = rosterOf(roundId)
  const drawnCount = recordsOf(roundId).length

  const [groups, setGroups] = useState<PrizeGroup[]>(() => getPrizeGroups(roundId))
  const [notice, setNotice] = useState<string | null>(null)

  const slots = useMemo(() => expandPrizeSlots(groups), [groups])
  const total = totalPrizeCount(groups)
  const available = roster.length - drawnCount

  const patchGroup = (id: string, patch: Partial<Omit<PrizeGroup, 'id'>>) => {
    setGroups((current) =>
      current.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    )
    setNotice(null)
  }

  const removeGroup = (id: string) => {
    setGroups((current) => current.filter((group) => group.id !== id))
    setNotice(null)
  }

  const addGroup = () => {
    setGroups((current) => [
      ...current,
      { id: `custom-${crypto.randomUUID().slice(0, 8)}`, name: '新奖品', count: 1 },
    ])
    setNotice(null)
  }

  const save = () => {
    setPrizeGroupsOverride(roundId, groups)
    setNotice('已保存，返回抽奖大屏即可按新顺序抽取')
  }

  const restoreDefault = () => {
    setPrizeGroupsOverride(roundId, null)
    setGroups([...DEFAULT_PRIZE_GROUPS[roundId]])
    setNotice('已恢复为默认奖品配置')
  }

  return (
    <AppShell activeRound={roundId}>
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-5">
        <header className="flex shrink-0 items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-trae/40 bg-trae/10 px-2 py-1 font-mono text-[0.6875rem] tracking-[0.2em] text-trae">
                {meta.code}
              </span>
              <h1 className="text-2xl font-semibold tracking-wide text-lab-ink">
                {meta.title} · 奖品配置
              </h1>
            </div>
            <p className="mt-2 text-sm text-lab-dim">
              共 {total} 份奖品
              <span className="mx-2 text-lab-faint">|</span>
              尚未中奖的候选人 {available} 人
              {total > available && (
                <span className="ml-3 text-warn">奖品份数多于可抽人数，抽到最后会无球可出</span>
              )}
            </p>
          </div>
          <Link
            to={`/round/${roundId}`}
            className="rounded-lg border border-trae/50 bg-trae/10 px-4 py-2.5 text-sm text-trae transition-colors hover:bg-trae/20"
          >
            返回抽奖大屏
          </Link>
        </header>

        <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <section className="glass rounded-2xl p-5">
            <header className="flex items-baseline justify-between">
              <h2 className="text-[0.9375rem] font-semibold text-lab-ink">奖品组</h2>
              <span className="font-mono text-[0.75rem] text-lab-dim">{groups.length} 组</span>
            </header>
            <p className="mt-1 text-[0.75rem] leading-relaxed text-lab-dim">
              数组顺序即抽取顺序：自上而下依次抽完每一组。
            </p>

            <ul className="mt-4 space-y-2">
              {groups.map((group, index) => (
                <li
                  key={group.id}
                  className="grid grid-cols-[32px_minmax(0,1fr)_110px_36px] items-center gap-3 rounded-lg border border-lab-line px-3 py-2.5"
                >
                  <span className="font-mono text-[0.75rem] text-lab-faint">{index + 1}</span>
                  <input
                    value={group.name}
                    onChange={(event) => patchGroup(group.id, { name: event.target.value })}
                    className="w-full rounded-md border border-transparent bg-lab-void/60 px-3 py-2 text-sm text-lab-ink outline-none transition-colors focus:border-trae/50"
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={group.count}
                      onChange={(event) =>
                        patchGroup(group.id, { count: Math.max(1, Number(event.target.value) || 1) })
                      }
                      className="w-full rounded-md border border-transparent bg-lab-void/60 px-3 py-2 font-mono text-sm text-trae outline-none transition-colors focus:border-trae/50"
                    />
                    <span className="shrink-0 text-[0.75rem] text-lab-dim">份</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeGroup(group.id)}
                    title="删除该奖品组"
                    className="grid size-8 place-items-center rounded-md text-lab-dim transition-colors hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {groups.length === 0 && (
                <li className="rounded-lg border border-dashed border-lab-line px-4 py-8 text-center text-sm text-lab-faint">
                  没有奖品组，无法抽奖
                </li>
              )}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addGroup}
                className="rounded-lg border border-dashed border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:border-trae/45 hover:text-trae"
              >
                + 添加奖品组
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-lg border border-trae/50 bg-trae/10 px-5 py-2.5 text-sm font-medium text-trae transition-colors hover:bg-trae/20"
              >
                保存配置
              </button>
              <button
                type="button"
                onClick={restoreDefault}
                className="rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:text-lab-ink"
              >
                恢复默认
              </button>
              {notice && <span className="text-[0.75rem] text-trae">{notice}</span>}
            </div>
          </section>

          <section className="glass flex min-h-0 flex-col rounded-2xl p-5">
            <header className="flex items-baseline justify-between">
              <h2 className="text-[0.9375rem] font-semibold text-lab-ink">抽取顺序预览</h2>
              <span className="font-mono text-[0.75rem] text-lab-dim">{slots.length}</span>
            </header>
            <ol className="no-scrollbar mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {slots.map((slot) => {
                const drawn = slot.slotIndex < drawnCount
                return (
                  <li
                    key={slot.slotIndex}
                    className={`flex items-center gap-3 rounded-md border px-3 py-1.5 text-[0.8125rem] ${
                      drawn ? 'border-trae/30 text-lab-dim' : 'border-lab-line/60 text-lab-ink'
                    }`}
                  >
                    <span className="w-8 shrink-0 font-mono text-[0.6875rem] text-lab-faint">
                      {slot.slotIndex + 1}
                    </span>
                    <span className="flex-1 truncate">{slot.groupName}</span>
                    <span className="font-mono text-[0.6875rem] text-lab-dim">
                      #{slot.groupSlot}
                    </span>
                    {drawn && <span className="text-[0.6875rem] text-trae">已抽</span>}
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
      </div>
    </AppShell>
  )
}