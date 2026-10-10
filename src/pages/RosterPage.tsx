import { Link, Navigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { RosterEditor } from '@/components/RosterEditor'
import { ROUND_META } from '@/config/rounds'
import { LIKES_ROSTER, ONSITE_ROSTER, builtinCandidates } from '@/data/rosters'
import { useLottery } from '@/store/lottery'
import type { RoundId } from '@/types'

const ROUND_IDS: RoundId[] = ['likes', 'onsite', 'consolation']

function isRoundId(value: string | undefined): value is RoundId {
  return value !== undefined && ROUND_IDS.includes(value as RoundId)
}

export function RosterPage() {
  const params = useParams<{ roundId: string }>()
  const roundId = params.roundId

  if (!isRoundId(roundId)) {
    return <Navigate to="/overview" replace />
  }

  return <RosterStage roundId={roundId} />
}

function RosterStage({ roundId }: { roundId: RoundId }) {
  const {
    rosterOf,
    recordsOf,
    setRoster,
    addCandidate,
    updateCandidate,
    removeCandidate,
  } = useLottery()

  const meta = ROUND_META[roundId]
  const roster = rosterOf(roundId)
  const records = recordsOf(roundId)
  const wonIds = new Set(records.map((record) => record.candidateId))
  const derived = meta.rosterSource === 'onsite-losers'
  const offline = !derived && roster.length !== meta.expectedCandidates

  const builtin = roundId === 'likes' ? LIKES_ROSTER : roundId === 'onsite' ? ONSITE_ROSTER : null

  return (
    <AppShell activeRound={roundId}>
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-5">
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-trae/40 bg-trae/10 px-2 py-1 font-mono text-[0.6875rem] tracking-[0.2em] text-trae">
                {meta.code}
              </span>
              <h1 className="text-2xl font-semibold tracking-wide text-lab-ink">
                {meta.title} · 名单管理
              </h1>
            </div>
            <p className="mt-2 text-sm text-lab-dim">
              当前 {roster.length} 人
              {derived ? (
                <>
                  <span className="mx-2 text-lab-faint">|</span>
                  现场轮未中奖者自动推导
                </>
              ) : (
                <>
                  <span className="mx-2 text-lab-faint">|</span>
                  预期 {meta.expectedCandidates} 人
                  {offline && <span className="ml-3 text-warn">与预期不一致，请核对</span>}
                </>
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

        <RosterEditor
          candidates={roster}
          wonIds={wonIds}
          readOnly={derived}
          banner={
            derived ? (
              <p className="rounded-lg border border-trae/30 bg-trae/5 px-4 py-3 text-[0.8125rem] leading-relaxed text-lab-dim">
                安慰轮与现场轮共用同一份名单：这里的候选池就是现场轮那 100 人里
                <span className="text-trae">还没中奖的 {roster.length} 人</span>。
                名单随现场轮结果实时推导，不需要手动同步，也不能在这里单独增删。
              </p>
            ) : undefined
          }
          onReplace={(candidates) => setRoster(roundId, candidates)}
          onAppend={(candidates) => setRoster(roundId, [...roster, ...candidates])}
          onAdd={(candidate) => addCandidate(roundId, candidate)}
          onUpdate={(candidateId, patch) => updateCandidate(roundId, candidateId, patch)}
          onRemove={(candidateId) => removeCandidate(roundId, candidateId)}
          extraActions={
            builtin ? (
              <div>
                <p className="text-[0.75rem] leading-relaxed text-lab-dim">
                  内置名单已从活动表格提取：
                  <span className="text-lab-ink">
                    {roundId === 'likes' ? '问卷.xlsx 的 16 人 + 补录 2 人' : '组队名单.xlsx 的 100 人'}
                  </span>
                  。首次打开时若名单为空会自动载入。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      roster.length > 0 &&
                      !window.confirm(`将用内置的 ${builtin.length} 人替换当前 ${roster.length} 人名单，确定吗？`)
                    ) {
                      return
                    }
                    setRoster(roundId, builtinCandidates(builtin))
                  }}
                  className="mt-3 w-full rounded-lg border border-trae/50 bg-trae/10 px-4 py-2.5 text-sm text-trae transition-colors hover:bg-trae/20"
                >
                  载入内置名单（{builtin.length} 人）
                </button>
              </div>
            ) : undefined
          }
        />
      </div>
    </AppShell>
  )
}