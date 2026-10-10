import { Link } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ROUND_META, ROUND_ORDER, getPrizeGroups, totalPrizeCount } from '@/config/rounds'
import { useLottery } from '@/store/lottery'

export function OverviewPage() {
  const { rosterOf, recordsOf, poolOf } = useLottery()

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-5">
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-lab-ink">抽奖总览</h1>
            <p className="mt-2 text-sm text-lab-dim">
              三个环节独立名单、独立奖品、独立结果。所有中奖记录实时写入本地存储，刷新或意外关闭后会自动恢复。
            </p>
          </div>
          <Link
            to="/logs"
            className="rounded-lg border border-trae/50 bg-trae/10 px-4 py-2.5 text-sm text-trae transition-colors hover:bg-trae/20"
          >
            查看开奖记录 · 复制 / 导出 CSV
          </Link>
        </header>

        <div className="grid shrink-0 gap-5 lg:grid-cols-3">
          {ROUND_ORDER.map((roundId) => {
            const meta = ROUND_META[roundId]
            const roster = rosterOf(roundId)
            const records = recordsOf(roundId)
            const pool = poolOf(roundId)
            const total = totalPrizeCount(getPrizeGroups(roundId))
            const percent = total === 0 ? 0 : Math.round((records.length / total) * 100)
            const finished = total > 0 && records.length >= total

            return (
              <section key={roundId} className="glass flex flex-col rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <span className="rounded-md border border-trae/40 bg-trae/10 px-2 py-1 font-mono text-[0.6875rem] tracking-[0.2em] text-trae">
                    {meta.code}
                  </span>
                  {finished && (
                    <span className="rounded-full border border-trae/40 px-3 py-1 text-[0.6875rem] text-trae">
                      已完成
                    </span>
                  )}
                </div>

                <h2 className="mt-4 text-2xl font-semibold text-lab-ink">{meta.title}</h2>
                <p className="mt-1 text-[0.8125rem] text-lab-dim">{meta.subtitle}</p>

                <dl className="mt-5 grid grid-cols-3 gap-3">
                  <Stat label="名单" value={roster.length} />
                  <Stat label="可抽池" value={pool.length} accent />
                  <Stat label="已中奖" value={`${records.length}/${total}`} />
                </dl>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-lab-panel-2">
                  <div
                    className="h-full rounded-full bg-trae transition-[width] duration-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="mt-6 flex gap-2">
                  <Link
                    to={`/round/${roundId}`}
                    className="flex-1 rounded-lg border border-trae/50 bg-trae/10 px-4 py-2.5 text-center text-sm font-medium text-trae transition-colors hover:bg-trae/20"
                  >
                    进入抽奖大屏
                  </Link>
                  <Link
                    to={`/round/${roundId}/roster`}
                    className="rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:text-lab-ink"
                  >
                    名单
                  </Link>
                  <Link
                    to={`/round/${roundId}/prizes`}
                    className="rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:text-lab-ink"
                  >
                    奖品
                  </Link>
                </div>
              </section>
            )
          })}
        </div>

        <section className="glass shrink-0 rounded-2xl p-5">
          <h2 className="text-[0.9375rem] font-semibold text-lab-ink">现场操作提示</h2>
          <ul className="mt-3 grid gap-2 text-[0.8125rem] leading-relaxed text-lab-dim lg:grid-cols-2">
            <li>· 空格键推进流程：待机时开始摇号，出球落定后确认进入下一份奖品。</li>
            <li>· 中奖者不可重复：同一环节内已中奖的人会自动从可抽池中剔除。</li>
            <li>· 名单已内置：集赞轮是问卷的 16 人 + 补录 2 人，现场轮是组队名单的 100 人，首次打开自动载入。</li>
            <li>· 安慰轮与现场轮共享同一份名单，候选池就是现场轮那 100 人里未中奖的部分，无需手动同步。</li>
            <li>· 抽错可用「撤销上一条」回退，不需要清空重来。</li>
            <li>· 安慰轮可用「快速模式」一次抽满 20 份，中奖名单会实时上墙滚动。</li>
            <li>· 抽到压轴奖品前会先播 3.5 秒 FINAL PRIZE 全屏提示，不会影响后续流程。</li>
            <li>· 快捷键：空格抽取 · → 下一环节 · F 全屏 · M 静音 · H 帮助。</li>
            <li>· 开奖记录页支持一键复制与 CSV 导出，含秒级时间、环节、奖品等级。</li>
            <li>· 60 秒无操作自动进入屏保，按任意键唤醒。</li>
          </ul>
        </section>
      </div>
    </AppShell>
  )
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: number | string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-lab-line px-3 py-2.5">
      <dt className="text-[0.6875rem] tracking-wide text-lab-faint">{label}</dt>
      <dd
        className={`mt-1 font-mono text-lg ${accent ? 'text-trae' : 'text-lab-ink'}`}
      >
        {value}
      </dd>
    </div>
  )
}