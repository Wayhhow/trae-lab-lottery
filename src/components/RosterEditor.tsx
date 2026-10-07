import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Candidate } from '@/types'
import { createCandidate, parseRoster } from '@/lib/roster'

interface RosterEditorProps {
  candidates: Candidate[]
  /** 已中奖候选人 id，用于在名单里标注 */
  wonIds: Set<string>
  onReplace: (candidates: Candidate[]) => void
  onAppend: (candidates: Candidate[]) => void
  onAdd: (candidate: Candidate) => void
  onUpdate: (candidateId: string, patch: Partial<Pick<Candidate, 'no' | 'name'>>) => void
  onRemove: (candidateId: string) => void
  /**
   * 只读模式。
   * 安慰轮与现场轮共用同一份名单，不能在安慰轮侧单独增删改。
   */
  readOnly?: boolean
  /** 列表上方的说明条 */
  banner?: ReactNode
  /** 导入区下方的附加操作 */
  extraActions?: ReactNode
}

const PLACEHOLDER = `每行一人，支持两种格式：
001 张三
李四`

export function RosterEditor({
  candidates,
  wonIds,
  onReplace,
  onAppend,
  onAdd,
  onUpdate,
  onRemove,
  readOnly = false,
  banner,
  extraActions,
}: RosterEditorProps) {
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const runImport = (mode: 'replace' | 'append') => {
    const { candidates: parsed, duplicates } = parseRoster(draft)
    if (parsed.length === 0) {
      setNotice('没有解析到有效名单，请检查每行是否都有姓名')
      return
    }
    if (mode === 'replace') {
      onReplace(parsed)
    } else {
      onAppend(parsed)
    }
    setNotice(
      `${mode === 'replace' ? '替换' : '追加'}导入 ${parsed.length} 人${
        duplicates > 0 ? `，跳过 ${duplicates} 条重复` : ''
      }`,
    )
    setDraft('')
  }

  const gridTemplate = readOnly
    ? 'grid-cols-[5rem_minmax(0,1fr)_5.5rem]'
    : 'grid-cols-[5rem_minmax(0,1fr)_5.5rem_2.25rem]'

  const list = (
    <section className="glass flex min-h-0 flex-col rounded-2xl p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[0.9375rem] font-semibold text-lab-ink">名单明细</h2>
        <span className="font-mono text-[0.75rem] text-lab-dim">{candidates.length} 人</span>
      </header>

      {banner && <div className="mt-3">{banner}</div>}

      <div
        className={`mt-3 grid shrink-0 ${gridTemplate} items-center gap-2 px-1 font-mono text-[0.6875rem] tracking-wider text-lab-faint`}
      >
        <span>编号</span>
        <span>姓名</span>
        <span>状态</span>
        {!readOnly && <span />}
      </div>

      <ul className="no-scrollbar mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {candidates.length === 0 && (
          <li className="rounded-lg border border-dashed border-lab-line px-3 py-8 text-center text-sm text-lab-faint">
            {readOnly ? '现场轮还没有导入名单，导入后这里会自动出现未中奖者' : '名单为空，先从左侧粘贴导入'}
          </li>
        )}
        {candidates.map((candidate) => {
          const won = wonIds.has(candidate.id)
          return (
            <li
              key={candidate.id}
              className={`grid ${gridTemplate} items-center gap-2 rounded-lg border border-lab-line/70 px-1 py-1.5`}
            >
              <input
                value={candidate.no}
                readOnly={readOnly}
                onChange={(event) => onUpdate(candidate.id, { no: event.target.value })}
                placeholder="—"
                className={`w-full rounded-md border border-transparent bg-lab-void/60 px-2 py-1.5 font-mono text-[0.75rem] text-lab-dim outline-none transition-colors ${
                  readOnly ? '' : 'focus:border-trae/50 focus:text-lab-ink'
                }`}
              />
              <input
                value={candidate.name}
                readOnly={readOnly}
                onChange={(event) => onUpdate(candidate.id, { name: event.target.value })}
                placeholder="姓名"
                className={`w-full rounded-md border border-transparent bg-lab-void/60 px-2 py-1.5 text-sm text-lab-ink outline-none transition-colors ${
                  readOnly ? '' : 'focus:border-trae/50'
                }`}
              />
              <span className={`text-center text-[0.6875rem] ${won ? 'text-trae' : 'text-lab-faint'}`}>
                {won ? '已中奖' : '待抽'}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemove(candidate.id)}
                  title="删除该条"
                  className="grid size-8 place-items-center rounded-md border border-transparent text-lab-dim transition-colors hover:border-danger/50 hover:text-danger"
                >
                  ✕
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {!readOnly && (
        <button
          type="button"
          onClick={() => onAdd(createCandidate())}
          className="mt-3 shrink-0 rounded-lg border border-dashed border-lab-line px-4 py-2.5 text-sm text-lab-dim transition-colors hover:border-trae/45 hover:text-trae"
        >
          + 添加一条
        </button>
      )}
    </section>
  )

  if (readOnly) {
    return <div className="min-h-0">{list}</div>
  }

  return (
    <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <section className="glass flex flex-col rounded-2xl p-5">
        <h2 className="text-[0.9375rem] font-semibold text-lab-ink">整段粘贴导入</h2>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-lab-dim">
          支持「编号 名字」或纯名字，每行一人。编号与姓名之间的空格、点号、顿号都会自动识别。
        </p>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="mt-3 h-56 w-full resize-none rounded-xl border border-lab-line bg-lab-void/70 p-3 font-mono text-[0.8125rem] leading-6 text-lab-ink outline-none transition-colors placeholder:text-lab-faint focus:border-trae/55"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => runImport('replace')}
            className="flex-1 rounded-lg border border-trae/50 bg-trae/10 px-4 py-2.5 text-sm font-medium text-trae transition-colors hover:bg-trae/20"
          >
            替换导入
          </button>
          <button
            type="button"
            onClick={() => runImport('append')}
            className="flex-1 rounded-lg border border-lab-line px-4 py-2.5 text-sm text-lab-ink transition-colors hover:border-trae/40"
          >
            追加导入
          </button>
        </div>
        {notice && <p className="mt-3 text-[0.75rem] text-trae">{notice}</p>}
        {extraActions && <div className="mt-4 border-t border-lab-line pt-4">{extraActions}</div>}
      </section>

      {list}
    </div>
  )
}