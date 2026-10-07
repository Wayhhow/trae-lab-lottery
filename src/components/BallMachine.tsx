import { useEffect, useRef, useState } from 'react'
import type { Candidate, LotteryPhase } from '@/types'
import { createBlower } from '@/lib/blower'
import type { BlowerHandle } from '@/lib/blower'

interface BallMachineProps {
  /** 当前可抽池：出球后中奖者会从池里消失，罐内球数随之递减 */
  candidates: Candidate[]
  phase: LotteryPhase
  winner: Candidate | null
  /** 目标球掉出罩体后触发，由业务层切到中奖展示 */
  onEjected: () => void
}

/**
 * 基于 matter.js 的物理摇号机。
 *
 * 物理模拟只负责表演：中奖者在业务层用 crypto 先行确定，
 * 这里只把既定的那颗球送出去。业务契约是 candidates / phase / winner / onEjected。
 */
export function BallMachine({ candidates, phase, winner, onEjected }: BallMachineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blowerRef = useRef<BlowerHandle | null>(null)
  const ejectedRef = useRef(onEjected)
  ejectedRef.current = onEjected

  const candidatesRef = useRef(candidates)
  candidatesRef.current = candidates

  const [fps, setFps] = useState(0)

  // 引擎随组件挂载创建、卸载销毁，期间不重建
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const blower = createBlower({
      container,
      canvas,
      onEjected: () => ejectedRef.current(),
    })
    blowerRef.current = blower

    // 开发模式挂出诊断入口，用来核对「罐内实球数 == 可抽池」
    const host = window as unknown as { __blowerDebug?: () => unknown }
    if (import.meta.env.DEV) {
      host.__blowerDebug = () => ({
        expected: candidatesRef.current.length,
        ...blower.debugSnapshot(),
      })
    }

    const timer = window.setInterval(() => setFps(blower.getFps()), 500)

    return () => {
      window.clearInterval(timer)
      blower.destroy()
      blowerRef.current = null
      if (import.meta.env.DEV) delete host.__blowerDebug
    }
  }, [])

  useEffect(() => {
    blowerRef.current?.setBalls(candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
    })))
  }, [candidates])

  useEffect(() => {
    blowerRef.current?.setPhase(phase, winner?.id ?? null)
  }, [phase, winner])

  return (
    <div
      ref={containerRef}
      className="glass scanlines relative h-full w-full overflow-hidden rounded-2xl"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {import.meta.env.DEV && (
        <span className="pointer-events-none absolute top-3 right-3 rounded-md border border-lab-line bg-lab-void/70 px-2 py-1 font-mono text-[0.6875rem] text-lab-dim">
          {fps.toFixed(0)} FPS
        </span>
      )}
    </div>
  )
}