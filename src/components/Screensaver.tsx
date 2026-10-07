import { useEffect } from 'react'
import { useIdle } from '@/store/idle'

/** 待机屏保时顶部滚动的活动标语 */
const SLOGANS = [
  'TRAE 实验室 · 百人摇号',
  '人人都是开发者',
  '把一个想法，变成能跑的作品',
  '让 AI 替你写完那些重复的代码',
  'TRAE 线上带练 · 现场抽奖进行中',
]

/**
 * 无操作屏保。
 * 半透明背景让摇号机里的球继续在背后翻滚，顶部跑马灯滚动标语。
 */
export function Screensaver() {
  const { idle, wake } = useIdle()

  // 屏保期间吞掉第一次按键，只做唤醒，避免顺手触发抽奖
  useEffect(() => {
    if (!idle) return
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      wake()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [idle, wake])

  if (!idle) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-lab-void/72 backdrop-blur-[2px]">
      <div className="marquee relative shrink-0 overflow-hidden border-b border-trae/25 bg-lab-void/70 py-3">
        <div className="marquee-track flex w-max whitespace-nowrap">
          {[0, 1].map((copy) => (
            <span key={copy} className="flex shrink-0">
              {SLOGANS.map((slogan) => (
                <span
                  key={`${copy}-${slogan}`}
                  className="mx-10 font-mono text-[1.125rem] tracking-[0.3em] text-trae"
                >
                  {slogan}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-end justify-center pb-10">
        <p className="animate-pulse font-mono text-[0.875rem] tracking-[0.3em] text-lab-dim">
          按任意键继续
        </p>
      </div>
    </div>
  )
}