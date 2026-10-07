interface FinalPrizeOverlayProps {
  /** 压轴奖品名称 */
  prizeName: string
  /** 该奖品还剩几份 */
  remaining: number
}

/**
 * 压轴奖品（平板电脑包）抽取前的全屏提示。
 *
 * 纯展示层：由 RoundPage 在按下空格后先播 3.5 秒再调用 start()，
 * 因此完全不介入已验收的物理与状态机流程。
 */
export function FinalPrizeOverlay({ prizeName, remaining }: FinalPrizeOverlayProps) {
  return (
    <div className="finale absolute inset-0 z-40 grid place-items-center overflow-hidden rounded-2xl bg-lab-void/94">
      <div className="finale-rays absolute inset-0" aria-hidden />
      <div className="finale-vignette absolute inset-0" aria-hidden />

      <div className="finale-pop relative text-center">
        <p className="font-mono text-[1rem] tracking-[0.55em] text-trae">FINAL PRIZE</p>
        <h2 className="text-glow mt-4 text-[4.5rem] leading-none font-semibold tracking-[0.12em] text-lab-ink">
          {prizeName}
        </h2>
        <p className="mt-5 font-mono text-[0.9375rem] tracking-[0.3em] text-lab-dim">
          压轴奖 · 共 {remaining} 份
        </p>
      </div>
    </div>
  )
}