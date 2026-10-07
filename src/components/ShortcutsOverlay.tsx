interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: '空格', label: '抽取球体 / 自动播放中按它停止' },
  { keys: 'A', label: '自动连抽（集赞轮、现场轮）' },
  { keys: '→', label: '切换至下一组' },
  { keys: 'F', label: '全屏切换' },
  { keys: 'M', label: '静音切换' },
  { keys: 'H', label: '显示 / 隐藏本说明' },
  { keys: 'Esc', label: '关闭浮层' },
]

/** H 键唤出的快捷键说明浮层 */
export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-lab-void/80 p-6"
      onClick={onClose}
    >
      <section
        className="glass w-full max-w-[32rem] rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-lab-ink">快捷键</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-lab-line px-3 py-1.5 text-sm text-lab-dim transition-colors hover:text-lab-ink"
          >
            关闭
          </button>
        </header>

        <ul className="mt-4 space-y-1.5">
          {SHORTCUTS.map((item) => (
            <li
              key={item.keys}
              className="flex items-center gap-4 rounded-lg border border-lab-line px-4 py-2.5"
            >
              <kbd className="grid min-w-[4.5rem] place-items-center rounded-md border border-trae/40 bg-trae/10 px-2.5 py-1.5 font-mono text-[0.8125rem] text-trae">
                {item.keys}
              </kbd>
              <span className="text-sm text-lab-ink">{item.label}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[0.75rem] leading-relaxed text-lab-dim">
          抽奖过程中「摇号中」与「出球」阶段不会响应空格，避免误触重复抽取。
        </p>
      </section>
    </div>
  )
}