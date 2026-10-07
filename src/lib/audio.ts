import { Howl, Howler } from 'howler'

/**
 * 音效系统。
 *
 * 只保留两类必要的音效：出球与中奖。
 * 曾经有一条常驻的鼓风白噪音，但它会一直在底噪里"沙沙"作响，
 * 反而盖住了真正的提示音，已整体移除。
 *
 * 素材没有外链任何音频文件，而是运行时用数学方法合成 WAV。
 * 这样既彻底回避了版权问题（比引用 CC0 文件更干净：不存在来源不明或授权变更的风险），
 * 也不依赖网络，现场不会因为拉不到素材而静音。
 * 若要换成真实录音，只需把 createSources() 里的 src 换成文件 URL，其余逻辑不变。
 */

const SAMPLE_RATE = 22050

interface Sources {
  eject: string
  win: string
}

let sources: Sources | null = null
let ejectSound: Howl | null = null
let winSound: Howl | null = null

/** 是否已解锁（浏览器要求首次用户手势后才能出声） */
let unlocked = false
let muted = false

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const frames = samples.length
  const buffer = new ArrayBuffer(44 + frames * 2)
  const view = new DataView(buffer)

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + frames * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, frames * 2, true)

  let offset = 44
  for (let i = 0; i < frames; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** 出球「哐当」：一团撞击噪声 + 几个非谐波金属分音 */
function makeEjectClank(): Float32Array {
  const total = Math.floor(SAMPLE_RATE * 0.5)
  const out = new Float32Array(total)
  const partials = [186, 324, 517, 823, 1291]
  const decays = [24, 29, 36, 45, 58]

  for (let i = 0; i < total; i += 1) {
    const t = i / SAMPLE_RATE
    let value = 0
    if (t < 0.035) {
      value += (Math.random() * 2 - 1) * Math.exp(-t * 150) * 0.5
    }
    for (let p = 0; p < partials.length; p += 1) {
      value +=
        Math.sin(2 * Math.PI * (partials[p] ?? 0) * t) * Math.exp(-t * (decays[p] ?? 0)) * 0.15
    }
    out[i] = value * 0.9
  }
  return out
}

/** 中奖 fanfare：C5-E5-G5-C6 上行琶音，末音留长 */
function makeWinFanfare(): Float32Array {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  const step = 0.155
  const total = Math.floor(SAMPLE_RATE * (notes.length * step + 0.85))
  const out = new Float32Array(total)

  notes.forEach((freq, index) => {
    const start = Math.floor(index * step * SAMPLE_RATE)
    const isLast = index === notes.length - 1
    const duration = Math.floor(SAMPLE_RATE * (isLast ? 1.0 : 0.34))
    for (let i = 0; i < duration && start + i < total; i += 1) {
      const t = i / SAMPLE_RATE
      const attack = Math.min(1, t / 0.012)
      const envelope = attack * Math.exp(-t * (isLast ? 3.1 : 7.5))
      const tone =
        Math.sin(2 * Math.PI * freq * t) * 0.5 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.17 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.07
      out[start + i] = (out[start + i] ?? 0) + tone * envelope * 0.5
    }
  })
  return out
}

function createSources(): Sources {
  const toUrl = (samples: Float32Array) => URL.createObjectURL(encodeWav(samples, SAMPLE_RATE))
  return {
    eject: toUrl(makeEjectClank()),
    win: toUrl(makeWinFanfare()),
  }
}

function ensure(): void {
  if (ejectSound) return
  sources = createSources()
  ejectSound = new Howl({ src: [sources.eject], format: ['wav'], volume: 0.75 })
  winSound = new Howl({ src: [sources.win], format: ['wav'], volume: 0.6 })
  Howler.mute(muted)
}

/** 首次用户手势时调用：浏览器只允许在手势之后出声 */
export function unlockAudio(): void {
  unlocked = true
  ensure()
  Howler.volume(1)
}

export function playEject(): void {
  if (!unlocked) return
  ensure()
  ejectSound?.play()
}

export function playWin(): void {
  if (!unlocked) return
  ensure()
  winSound?.play()
}

export function setMuted(next: boolean): void {
  muted = next
  Howler.mute(next)
}

export function destroyAudio(): void {
  ejectSound?.unload()
  winSound?.unload()
  ejectSound = null
  winSound = null
  if (sources) {
    for (const url of Object.values(sources)) URL.revokeObjectURL(url)
    sources = null
  }
}