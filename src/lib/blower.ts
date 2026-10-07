import { Bodies, Body, Composite, Engine, Events, Runner } from 'matter-js'
import type { LotteryPhase } from '@/types'

export interface BlowerBall {
  id: string
  name: string
}

export interface BlowerOptions {
  container: HTMLElement
  canvas: HTMLCanvasElement
  /** 目标球完全掉出罩体后触发，由业务层推进到中奖展示 */
  onEjected: () => void
}

export interface BlowerHandle {
  /** 同步球体名单：补入新球、移除已不在名单里的球 */
  setBalls: (balls: BlowerBall[]) => void
  /** 驱动状态机：进入 ejecting 时开闸并把目标球送出去 */
  setPhase: (phase: LotteryPhase, winnerId: string | null) => void
  getFps: () => number
  /** 诊断用：统计罩体内外的球数，用于核对「罐内实球数 == 可抽池」 */
  debugSnapshot: () => BlowerDebug
  destroy: () => void
}

/** 诊断快照：把球按所在区域分类，便于定位数量缺口来源 */
export interface BlowerDebug {
  /** 罩体内的球数（正常应等于可抽池大小） */
  inChamber: number
  /** 已跑到罩体外的球数（穿墙或从出口漏出后坠落） */
  outOfBounds: number
  /** 停在出球口水平线以下的球数（大多是从敞开的出口溜出去的） */
  belowExit: number
  /** 闸门开启进度，0 为关闭，1 为全开 */
  gateProgress: number
  /** 当前球体的最大速度（px/步），用来判断是否会穿透墙体或闸门 */
  maxSpeed: number
  /** 引擎里实际持有的球体总数。idle 相位下应等于可抽池 */
  tracked: number
  /** 被出球拦截集合挡住的球数（正常应总是 0） */
  retired: number
  /** 当前相位：出球与展示期间球队少 1 是正常的，球已离罐但结果尚未确认 */
  phase: LotteryPhase
}

interface Vec {
  x: number
  y: number
}

interface Chamber {
  width: number
  height: number
  cx: number
  margin: number
  cornerR: number
  cornerY: number
  funnelTopY: number
  bottomY: number
  /** 内壁折线：墙体沿它生成，玻璃也沿它绘制 */
  path: Vec[]
}

interface Ball {
  body: Body
  texture: HTMLCanvasElement
  radius: number
  name: string
}

// ── 尺寸与容器 ──────────────────────────────────────────────────

/** 球体半径区间，按规格随机生成 */
const BALL_RADIUS_MIN = 26
const BALL_RADIUS_MAX = 34
/**
 * 罩体内球体面积占比上限。
 * 26~34px 的半径是按 1920×1080 全屏设计的：100 颗球约 283k px²，
 * 全屏时占比仅 2 成，完全放得下。窗口明显偏小时按比例缩小半径，
 * 否则球会被挤爆出罩体。全屏下该保护不会生效。
 */
const MAX_PACKING = 0.5

/** 罩体壁厚，同时决定玻璃罩描边宽度 */
const WALL_THICKNESS = 22
/**
 * 出球口净宽。
 * 球体直径最大 68px，闸门开启后自身还要占位，
 * 所以通道必须明显宽于球径，否则球会卡在颈口。
 */
const EXIT_GAP = 84
/** 溜槽半宽 */
const CHUTE_HALF = 90
/** 单段墙体最大长度，过长的墙会让高速球体穿透 */
const MAX_WALL_SEGMENT = 60
const ARC_STEPS = 12
/**
 * 球体速度上限（px/物理步）。
 * matter.js 是离散碰撞，球每步的位移必须小于壁厚（22px）才不会被跳过。
 * 实测球数少时气流会把球吹到 30~211 px/步，直接从墙里穿出去；
 * 这个上限同时高于正常抛升初速（约 14 px/步）和自由落体极速（约 17 px/步），
 * 不会让运动变呆。
 */
const MAX_BALL_SPEED = 20
/**
 * 包络夹取的松紧度：比「贴壁静止」的位置再放宽几像素。
 * 正常贴着内壁的球不会被反复夹取，只有真正穿出去的球才会被拉回来。
 */
const CONTAIN_SLACK = 4

// ── 气流 ────────────────────────────────────────────────────────

/** 每隔 300ms（摇号中提速到 180ms）随机挑 3~5 颗球向上吹 */
const AIR_INTERVAL_IDLE_MS = 300
const AIR_INTERVAL_SPIN_MS = 180
const AIR_KICK_MIN = 3
const AIR_KICK_MAX = 5
/** 目标抛升高度相对罩体可用高度的倍率，唯一的手感调参旋钮 */
const AIR_LIFT_RATIO = 1.5

// ── 出球 ────────────────────────────────────────────────────────

/** 出球时目标球的空气阻力，降低后可以一路滑到出球口 */
const EJECT_FRICTION_AIR = 0.001
/**
 * 出球引导力（按质量归一）。
 * 重力每步带来 0.278 px/step 的速度增量，这里取同量级即可：
 * 太大会让球在十几个物理步内瞬移到出口（实测 0.16 时出球只要约 100ms），
 * 取约 1.2 倍重力才能在 1~2 秒内自然滑出。
 */
const EJECT_PULL = 0.0012
/** 出球时把其余球推离出口的力，同样按质量归一 */
const EJECT_REPEL = 0.005
const GATE_OPEN_MS = 280
/**
 * 闸门开启角。
 * 铰链在出球口两侧，如果只开 90° 左右，闸门会垂在通道里把球挡住
 * （实测 95° 时通道只剩 44px，球根本过不去）；
 * 开到 160° 才能完全翻到漏斗下方，让出整条通道。
 */
const GATE_SWING = (160 * Math.PI) / 180
/** 闸门厚度 */
const GATE_THICKNESS = 12
/** 出球引导的目标点，要落在检测线之下，否则永远等不到出球 */
const EJECT_TARGET_DEPTH = 70
/** 兜底：超时仍未出球就强行回收，避免流程卡死 */
const EJECT_TIMEOUT_MS = 3000
/** 出球节拍下限：验收要求出球落在 1~2 秒，球掉得快时也要保证不短于 1 秒 */
const EJECT_MIN_MS = 1000

const CAT_WALL = 0x0001
const CAT_BALL = 0x0002

export function createBlower({ container, canvas, onEjected }: BlowerOptions): BlowerHandle {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法获取 canvas 2d 上下文')
  }

  const engine = Engine.create()
  const runner = Runner.create()
  const world = engine.world
  engine.gravity.y = 1

  const balls = new Map<string, Ball>()
  const textures = new Map<string, HTMLCanvasElement>()
  /**
   * 已出球回收的候选人 id。
   * 出球瞬间名单里还留着这个人（要等业务层确认才落库），
   * 若不加拦截，任何一次重渲染都会把刚出球的球重新补回罩体。
   */
  const retired = new Set<string>()

  let chamber = buildChamber(320, 320)
  let ballScale = 1
  let walls: Body[] = []
  let leftGate: Body | null = null
  let rightGate: Body | null = null
  const gateHinges = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }

  let phase: LotteryPhase = 'idle'
  let winnerId: string | null = null
  let lastAirAt = 0
  let gateProgress = 0
  /** 目标球是否已离开罩体 */
  let ejected = true
  /** 是否已把出球结果上报给业务层 */
  let reported = true
  let ejectStartedAt = 0
  let disposed = false
  let fps = 0
  let lastFrameAt = 0
  let falling: {
    texture: HTMLCanvasElement
    radius: number
    x: number
    y: number
    vy: number
  } | null = null

  const pixelRatio = () => window.devicePixelRatio || 1

  // ── 罩体构建 ──────────────────────────────────────────────────
  const rebuildWalls = () => {
    for (const wall of walls) Composite.remove(world, wall)
    if (leftGate) Composite.remove(world, leftGate)
    if (rightGate) Composite.remove(world, rightGate)

    walls = buildWalls(chamber.path, WALL_THICKNESS)
    Composite.add(world, walls)

    gateHinges.left = { x: chamber.cx - EXIT_GAP / 2, y: chamber.bottomY }
    gateHinges.right = { x: chamber.cx + EXIT_GAP / 2, y: chamber.bottomY }
    const gateHalf = EXIT_GAP / 4

    leftGate = Bodies.rectangle(
      gateHinges.left.x + gateHalf,
      gateHinges.left.y,
      EXIT_GAP / 2,
      GATE_THICKNESS,
      gateOptions(),
    )
    rightGate = Bodies.rectangle(
      gateHinges.right.x - gateHalf,
      gateHinges.right.y,
      EXIT_GAP / 2,
      GATE_THICKNESS,
      gateOptions(),
    )
    Composite.add(world, [leftGate, rightGate])
    gateProgress = 0
    applyGate()
  }

  const applyGate = () => {
    if (!leftGate || !rightGate) return
    const gateHalf = EXIT_GAP / 4
    const eased = gateProgress * gateProgress * (3 - 2 * gateProgress)
    const swing = GATE_SWING * eased

    const leftAngle = swing
    Body.setAngle(leftGate, leftAngle)
    Body.setPosition(leftGate, {
      x: gateHinges.left.x + Math.cos(leftAngle) * gateHalf,
      y: gateHinges.left.y + Math.sin(leftAngle) * gateHalf,
    })

    const rightAngle = Math.PI - swing
    Body.setAngle(rightGate, rightAngle)
    Body.setPosition(rightGate, {
      x: gateHinges.right.x + Math.cos(rightAngle) * gateHalf,
      y: gateHinges.right.y + Math.sin(rightAngle) * gateHalf,
    })
  }

  const resize = () => {
    if (disposed) return
    const rect = container.getBoundingClientRect()
    const width = Math.max(320, Math.round(rect.width))
    const height = Math.max(320, Math.round(rect.height))
    if (width === chamber.width && height === chamber.height) return

    const dpr = pixelRatio()
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    chamber = buildChamber(width, height)
    ballScale = packingScale(chamber, Math.max(1, balls.size))
    rebuildWalls()

    for (const ball of balls.values()) {
      // 同样按罩体实际宽度收敛，避免重排时把球顶到内壁外侧
      const span = chamberSpanAt(chamber.path, ball.body.position.y, WALL_THICKNESS / 2)
      const lowerX = span.left + ball.radius
      Body.setPosition(ball.body, {
        x: clamp(ball.body.position.x, lowerX, Math.max(lowerX, span.right - ball.radius)),
        y: clamp(
          ball.body.position.y,
          chamber.margin + ball.radius,
          chamber.bottomY - ball.radius,
        ),
      })
    }
  }

  // ── 物理步进 ──────────────────────────────────────────────────
  /**
   * 速度封顶 + 出界兜底。
   *
   * 这是「球越来越少」的根治手段：球数少时气流几乎每轮都吹到每一颗球，
   * 冲量不断叠加会把速度推到穿墙量级。封顶把速度压在壁厚以下，
   * 包络再把已经跑到罩体外的球拉回来，保证罐内实球数不可能少于可抽池。
   */
  const containBalls = () => {
    const target =
      phase === 'ejecting' && !ejected && winnerId ? balls.get(winnerId)?.body : undefined
    const inset = WALL_THICKNESS / 2 - CONTAIN_SLACK
    const topLimit = chamber.margin + inset
    const bottomLimit = chamber.bottomY - inset

    for (const ball of balls.values()) {
      const body = ball.body

      if (body.speed > MAX_BALL_SPEED) {
        const scale = MAX_BALL_SPEED / body.speed
        Body.setVelocity(body, { x: body.velocity.x * scale, y: body.velocity.y * scale })
      }

      // 出球中的目标球必须放行，它本来就要穿过出口掉下去
      if (body === target) continue

      const safeY = clamp(body.position.y, topLimit + ball.radius, bottomLimit - ball.radius)
      const span = chamberSpanAt(chamber.path, safeY, inset)
      const lowerX = span.left + ball.radius
      const safeX = clamp(body.position.x, lowerX, Math.max(lowerX, span.right - ball.radius))

      if (safeX !== body.position.x || safeY !== body.position.y) {
        Body.setPosition(body, { x: safeX, y: safeY })
        // 从墙里拔出来时顺手卸掉大部分速度，避免它带着墙外速度继续冲
        Body.setVelocity(body, { x: body.velocity.x * 0.3, y: body.velocity.y * 0.3 })
      }
    }
  }

  const beforeUpdate = () => {
    if (disposed) return
    const now = performance.now()

    containBalls()

    // 闸门开合：只要目标球还没离罐就保持敞开，一旦出球立刻收闸。
    // 出球后若继续敞着，其余未中奖球会顺着出口自己滑出去
    // （实测停在中奖展示 10 秒就漏掉 2 颗，且确认后不会恢复）。
    const gateTarget = phase === 'ejecting' && !ejected ? 1 : 0
    if (gateProgress !== gateTarget) {
      const gateStep = 1000 / 60 / GATE_OPEN_MS
      gateProgress =
        gateTarget > gateProgress
          ? Math.min(gateTarget, gateProgress + gateStep)
          : Math.max(gateTarget, gateProgress - gateStep)
      applyGate()
    }

    if (phase === 'ejecting') {
      guideEjection()
      checkEjection(now)
      return
    }

    if (phase === 'idle' || phase === 'spinning') {
      const interval = phase === 'spinning' ? AIR_INTERVAL_SPIN_MS : AIR_INTERVAL_IDLE_MS
      if (now - lastAirAt >= interval) {
        lastAirAt = now
        applyAirKick()
      }
    }
  }

  const applyAirKick = () => {
    const list = Array.from(balls.values())
    if (list.length === 0) return

    const usableHeight = chamber.funnelTopY - chamber.margin
    const forcePerMass = airKickForcePerMass(usableHeight)
    const count = AIR_KICK_MIN + Math.floor(Math.random() * (AIR_KICK_MAX - AIR_KICK_MIN + 1))

    for (let i = 0; i < count; i += 1) {
      const ball = list[Math.floor(Math.random() * list.length)]
      if (!ball) continue
      const magnitude = forcePerMass * ball.body.mass
      Body.applyForce(ball.body, ball.body.position, {
        x: (Math.random() - 0.5) * magnitude * 0.6,
        y: -magnitude,
      })
    }
  }

  const guideEjection = () => {
    const exit = { x: chamber.cx, y: chamber.bottomY + EJECT_TARGET_DEPTH }
    const target = winnerId ? balls.get(winnerId) : undefined

    if (target) {
      const dx = exit.x - target.body.position.x
      const dy = exit.y - target.body.position.y
      const distance = Math.hypot(dx, dy) || 1
      const pull = EJECT_PULL * target.body.mass
      Body.applyForce(target.body, target.body.position, {
        x: (dx / distance) * pull,
        y: (dy / distance) * pull,
      })
    }

    // 其余球整体上抬并远离出口，避免把出口糊住
    for (const ball of balls.values()) {
      if (target && ball.body === target.body) continue
      const dx = ball.body.position.x - exit.x
      const dy = ball.body.position.y - exit.y
      const distance = Math.hypot(dx, dy) || 1
      const falloff = 1 - Math.min(1, distance / 520)
      const repel = EJECT_REPEL * ball.body.mass * falloff
      Body.applyForce(ball.body, ball.body.position, {
        x: (dx / distance) * repel,
        y: (dy / distance) * repel - repel * 0.8,
      })
    }
  }

  /** 目标球越过出球口下沿后回收，并把控制权交回业务层 */
  const checkEjection = (now: number) => {
    if (reported) return
    const elapsed = now - ejectStartedAt

    if (!ejected) {
      const target = winnerId ? balls.get(winnerId) : undefined
      const passed = !target || target.body.position.y > chamber.bottomY + target.radius
      const timedOut = elapsed > EJECT_TIMEOUT_MS
      if (!passed && !timedOut) return

      ejected = true
      if (target) {
        falling = {
          texture: target.texture,
          radius: target.radius,
          x: target.body.position.x,
          y: target.body.position.y,
          vy: 6,
        }
        Composite.remove(world, target.body)
        balls.delete(target.body.label)
        retired.add(target.body.label)
      }
    }

    if (elapsed >= EJECT_MIN_MS) {
      reported = true
      onEjected()
    }
  }

  // ── 渲染 ──────────────────────────────────────────────────────
  const afterUpdate = () => {
    if (disposed) return
    const now = performance.now()
    if (lastFrameAt > 0) {
      const delta = now - lastFrameAt
      if (delta > 0) fps = fps === 0 ? 1000 / delta : fps * 0.9 + (1000 / delta) * 0.1
    }
    lastFrameAt = now

    if (falling) {
      falling.vy += 0.9
      falling.y += falling.vy
      if (falling.y > chamber.height + falling.radius * 2) falling = null
    }

    render()
  }

  const render = () => {
    context.clearRect(0, 0, chamber.width, chamber.height)

    drawGlass(context, chamber)
    if (leftGate) drawGate(context, leftGate)
    if (rightGate) drawGate(context, rightGate)
    drawFunnelGlow(context, chamber)

    const revealing = phase === 'ejecting' || phase === 'revealed'
    const focusId = revealing ? winnerId : null

    for (const ball of balls.values()) {
      const isTarget = ball.body.label === focusId
      const radius = ball.radius * (isTarget ? 1 + 0.35 * gateProgress : 1)
      context.globalAlpha = revealing && !isTarget ? 0.3 : 1

      if (isTarget) {
        context.beginPath()
        context.arc(ball.body.position.x, ball.body.position.y, radius + 8, 0, Math.PI * 2)
        context.strokeStyle = 'rgba(50, 240, 140, 0.85)'
        context.lineWidth = 3
        context.stroke()
        context.beginPath()
        context.arc(ball.body.position.x, ball.body.position.y, radius + 17, 0, Math.PI * 2)
        context.strokeStyle = 'rgba(50, 240, 140, 0.22)'
        context.lineWidth = 6
        context.stroke()
      }

      // 纹理随刚体一起旋转，翻搅时能看出球的滚动
      context.save()
      context.translate(ball.body.position.x, ball.body.position.y)
      context.rotate(ball.body.angle)
      context.drawImage(ball.texture, -radius, -radius, radius * 2, radius * 2)
      context.restore()
    }

    if (falling) {
      context.globalAlpha = 1
      context.drawImage(
        falling.texture,
        falling.x - falling.radius,
        falling.y - falling.radius,
        falling.radius * 2,
        falling.radius * 2,
      )
    }

    context.globalAlpha = 1
  }

  // ── 名单同步 ──────────────────────────────────────────────────
  const textureFor = (name: string, radius: number): HTMLCanvasElement => {
    const key = `${name}|${radius}`
    const cached = textures.get(key)
    if (cached) return cached
    const created = renderNameTexture(name, radius, pixelRatio())
    textures.set(key, created)
    return created
  }

  const setBalls = (list: BlowerBall[]) => {
    if (disposed) return
    const wanted = new Map(list.map((item) => [item.id, item]))

    for (const [id, ball] of balls) {
      const item = wanted.get(id)
      if (!item) {
        Composite.remove(world, ball.body)
        balls.delete(id)
      } else if (item.name !== ball.name) {
        ball.name = item.name
        ball.texture = textureFor(item.name, ball.radius)
      }
    }

    const spawnList = list.filter((item) => !balls.has(item.id) && !retired.has(item.id))
    if (spawnList.length === 0) return

    ballScale = packingScale(chamber, Math.max(balls.size + spawnList.length, 1))

    const spacing = BALL_RADIUS_MAX * ballScale * 2 + 6
    const usableWidth = chamber.width - chamber.margin * 2 - WALL_THICKNESS
    const columns = Math.max(1, Math.floor(usableWidth / spacing))
    const rows = Math.ceil(spawnList.length / columns)
    const startX = chamber.cx - (columns * spacing) / 2 + spacing / 2
    const startY = chamber.margin + WALL_THICKNESS + spacing / 2
    /**
     * 行距必须让最后一行落在漏斗顶之上。
     * 之前这里有个 spacing*0.5 的下限，会把末行推到漏斗斜面以下的高度；
     * 那一行最外侧的球就出生在已经收窄的漏斗壁外面，随即坠出罩体，
     * 造成任何一次重建后都恒定少 1 颗球。
     */
    const rowStep =
      rows > 1
        ? Math.min(spacing, Math.max(1, (chamber.funnelTopY - startY) / (rows - 1)))
        : 0

    spawnList.forEach((item, index) => {
      const radius = (BALL_RADIUS_MIN + Math.random() * (BALL_RADIUS_MAX - BALL_RADIUS_MIN)) * ballScale
      const spawnY = startY + Math.floor(index / columns) * rowStep
      // 横向再按该高度上的实际可用宽度收敛一次，确保出生点一定在罩体内
      const span = chamberSpanAt(chamber.path, spawnY, WALL_THICKNESS / 2)
      const lowerX = span.left + radius
      const upperX = Math.max(lowerX, span.right - radius)
      const body = Bodies.circle(
        clamp(startX + (index % columns) * spacing, lowerX, upperX),
        spawnY,
        radius,
        {
          label: item.id,
          restitution: 0.5,
          frictionAir: 0.01,
          friction: 0.05,
          frictionStatic: 0.05,
          collisionFilter: { category: CAT_BALL, mask: CAT_WALL | CAT_BALL, group: 0 },
        },
      )
      Composite.add(world, body)
      balls.set(item.id, { body, texture: textureFor(item.name, radius), radius, name: item.name })
    })
  }

  const setPhase = (next: LotteryPhase, nextWinnerId: string | null) => {
    if (disposed) return
    if (next === phase && nextWinnerId === winnerId) return
    phase = next
    winnerId = nextWinnerId

    if (next === 'ejecting') {
      gateProgress = 0
      ejected = false
      reported = false
      ejectStartedAt = performance.now()
      const target = winnerId ? balls.get(winnerId) : undefined
      if (target) {
        // 降低空气阻力，并让它只与罩体碰撞，可穿过球群直达出口
        target.body.frictionAir = EJECT_FRICTION_AIR
        target.body.collisionFilter.mask = CAT_WALL
      }
    } else if (next === 'idle') {
      ejected = true
      reported = true
      // 回到待机说明结果已落库，解除拦截；若此时用「撤销」把球还回来，可以正常补入
      retired.clear()
      for (const ball of balls.values()) {
        ball.body.frictionAir = 0.01
        ball.body.collisionFilter.mask = CAT_WALL | CAT_BALL
      }
    }
  }

  // ── 诊断 ──────────────────────────────────────────────────────
  const debugSnapshot = (): BlowerDebug => {
    let inChamber = 0
    let outOfBounds = 0
    let belowExit = 0
    let maxSpeed = 0

    for (const ball of balls.values()) {
      const { x, y } = ball.body.position
      const radius = ball.radius
      const escaped =
        x < chamber.margin - radius ||
        x > chamber.width - chamber.margin + radius ||
        y < chamber.margin - radius ||
        y > chamber.bottomY + radius
      if (escaped) outOfBounds += 1
      else inChamber += 1
      if (y > chamber.bottomY) belowExit += 1
      if (ball.body.speed > maxSpeed) maxSpeed = ball.body.speed
    }

    return {
      inChamber,
      outOfBounds,
      belowExit,
      gateProgress,
      maxSpeed: Number(maxSpeed.toFixed(1)),
      tracked: balls.size,
      retired: retired.size,
      phase,
    }
  }

  // ── 生命周期 ──────────────────────────────────────────────────
  Events.on(engine, 'beforeUpdate', beforeUpdate)
  Events.on(engine, 'afterUpdate', afterUpdate)

  const observer = new ResizeObserver(() => resize())
  observer.observe(container)
  resize()

  Runner.run(runner, engine)

  return {
    setBalls,
    setPhase,
    getFps: () => fps,
    debugSnapshot,
    destroy: () => {
      disposed = true
      observer.disconnect()
      Runner.stop(runner)
      // 逐个摘掉自己注册的引擎事件，避免闭包继续持有 world / canvas
      Events.off(engine, 'beforeUpdate', beforeUpdate)
      Events.off(engine, 'afterUpdate', afterUpdate)
      Composite.clear(world, false, true)
      Engine.clear(engine)
      balls.clear()
      textures.clear()
      retired.clear()
      walls = []
      leftGate = null
      rightGate = null
      falling = null
    },
  }
}

// ── 罩体几何 ────────────────────────────────────────────────────

function buildChamber(width: number, height: number): Chamber {
  const margin = WALL_THICKNESS + 2
  const cx = width / 2
  const bottomY = height - 54
  const chuteTopY = bottomY - 74
  const funnelTopY = Math.max(margin + 170, chuteTopY - 150)
  const cornerR = Math.max(56, Math.min((width - margin * 2) / 2, (funnelTopY - margin) * 0.52))
  const cornerY = margin + cornerR
  const exitHalf = EXIT_GAP / 2

  const path: Vec[] = [
    { x: cx - exitHalf, y: bottomY },
    { x: cx - CHUTE_HALF, y: chuteTopY },
    { x: margin, y: funnelTopY },
    { x: margin, y: cornerY },
  ]

  // 左上圆角：180° → 270°
  for (let i = 1; i <= ARC_STEPS; i += 1) {
    const theta = Math.PI + (i / ARC_STEPS) * (Math.PI / 2)
    path.push({
      x: margin + cornerR + Math.cos(theta) * cornerR,
      y: cornerY + Math.sin(theta) * cornerR,
    })
  }

  // 右上圆角：270° → 360°，i=0 即为顶部平面右端
  const rightArcCx = width - margin - cornerR
  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const theta = Math.PI * 1.5 + (i / ARC_STEPS) * (Math.PI / 2)
    path.push({
      x: rightArcCx + Math.cos(theta) * cornerR,
      y: cornerY + Math.sin(theta) * cornerR,
    })
  }

  path.push(
    { x: width - margin, y: funnelTopY },
    { x: cx + CHUTE_HALF, y: chuteTopY },
    { x: cx + exitHalf, y: bottomY },
  )

  return { width, height, cx, margin, cornerR, cornerY, funnelTopY, bottomY, path }
}

/**
 * 求罩体在某个高度上的可用横向范围。
 * 内壁折线在圆顶、竖直侧壁、漏斗斜面上宽度不同，
 * 出生点、重排与越界夹取都必须按实际宽度收敛，不能当矩形处理。
 * inset 为相对内壁还要留出的余量。
 */
function chamberSpanAt(path: Vec[], y: number, inset: number): { left: number; right: number } {
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!
    const b = path[i + 1]!
    const low = Math.min(a.y, b.y)
    const high = Math.max(a.y, b.y)
    if (y < low || y > high) continue
    const t = high - low < 1e-6 ? 0 : (y - a.y) / (b.y - a.y)
    const x = a.x + (b.x - a.x) * t
    if (x < left) left = x
    if (x > right) right = x
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return { left: Number.NEGATIVE_INFINITY, right: Number.POSITIVE_INFINITY }
  }

  return { left: left + inset, right: right - inset }
}

function wallOptions() {
  return {
    isStatic: true,
    restitution: 0.2,
    friction: 0.04,
    frictionStatic: 0.04,
    collisionFilter: { category: CAT_WALL, mask: 0xffffffff, group: 0 },
    label: 'wall',
  }
}

function gateOptions() {
  return {
    isStatic: true,
    restitution: 0.2,
    friction: 0.1,
    collisionFilter: { category: CAT_WALL, mask: 0xffffffff, group: 0 },
    label: 'gate',
  }
}

/**
 * 沿折线铺静态矩形组成罩体。matter.js 没有曲面，
 * 弧形墙用若干短矩形逼近；相邻段互相搭接，避免接缝卡住球体。
 */
function buildWalls(path: Vec[], thickness: number): Body[] {
  const bodies: Body[] = []
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!
    const b = path[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length < 0.5) continue

    const angle = Math.atan2(dy, dx)
    const pieces = Math.max(1, Math.ceil(length / MAX_WALL_SEGMENT))
    const pieceLength = length / pieces
    for (let p = 0; p < pieces; p += 1) {
      const t = (p + 0.5) / pieces
      bodies.push(
        Bodies.rectangle(a.x + dx * t, a.y + dy * t, pieceLength + thickness * 0.5, thickness, {
          ...wallOptions(),
          angle,
        }),
      )
    }
  }
  return bodies
}

/** 罩体装不下这么多球时按比例缩小半径，全屏下返回 1 */
function packingScale(chamber: Chamber, count: number): number {
  const interior = (chamber.width - chamber.margin * 2) * (chamber.bottomY - chamber.margin)
  const averageRadius = (BALL_RADIUS_MIN + BALL_RADIUS_MAX) / 2
  const needed = count * Math.PI * averageRadius * averageRadius
  const budget = interior * MAX_PACKING
  return needed <= budget ? 1 : Math.sqrt(budget / needed)
}

/**
 * 把球抛到罩体顶部附近所需的力（已按质量归一）。
 * matter.js 的 Verlet 积分里 Δv = (F / m) · dt²，
 * 重力每步带来的速度增量是 0.001 · dt²；
 * 升到高度 h 需要初速度 √(2·g·h)，据此反推 F / m。
 *
 * 规格给出的力度基准 0.0006 只是重力的 0.6 倍，实测球体根本无法离地，
 * 所以这里不直接用基准值，而是按目标抛升高度反推。
 */
function airKickForcePerMass(usableHeight: number): number {
  const dt2 = (1000 / 60) ** 2
  const gravityStep = 0.001 * dt2
  const target = Math.max(80, usableHeight) * AIR_LIFT_RATIO
  const impulse = Math.sqrt(2 * gravityStep * target)
  return impulse / dt2
}

// ── 名字纹理 ────────────────────────────────────────────────────

/** 候选人名字离屏渲染成球体贴图：深绿底 + 白色文字 + 一道高光 */
function renderNameTexture(name: string, radius: number, dpr: number): HTMLCanvasElement {
  const size = radius * 2
  const surface = document.createElement('canvas')
  surface.width = Math.max(2, Math.round(size * dpr))
  surface.height = surface.width

  const g = surface.getContext('2d')
  if (!g) return surface
  g.scale(surface.width / size, surface.width / size)

  const base = g.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, '#12694a')
  base.addColorStop(1, '#04241a')
  g.fillStyle = base
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  g.fill()

  // 球体旋转时靠这道高光看出滚动
  const glint = g.createRadialGradient(
    size * 0.3,
    size * 0.26,
    0,
    size * 0.3,
    size * 0.26,
    size * 0.55,
  )
  glint.addColorStop(0, 'rgba(255, 255, 255, 0.34)')
  glint.addColorStop(1, 'rgba(255, 255, 255, 0)')
  g.fillStyle = glint
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  g.fill()

  g.strokeStyle = 'rgba(50, 240, 140, 0.75)'
  g.lineWidth = 2
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
  g.stroke()

  /**
   * 球面只显示名字的后两个字（三字名与四字名都取后两字），
   * 两字名原样显示；中奖弹窗走的是完整姓名，不受这里影响。
   * 纹理缓存的 key 用的是完整名字，所以同一颗球改名后会正确重建。
   */
  const label = name.length >= 3 ? name.slice(-2) : name
  const fontOf = (px: number) => `600 ${px}px "PingFang SC", "Microsoft YaHei", system-ui`
  const maxWidth = size * 0.84
  let fontSize = size * 0.52
  g.font = fontOf(fontSize)
  while (fontSize > 9 && g.measureText(label).width > maxWidth) {
    fontSize -= 1
    g.font = fontOf(fontSize)
  }

  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(label, size / 2, size / 2 + 1)

  return surface
}

// ── 绘制 ────────────────────────────────────────────────────────

function pathFrom(points: Vec[]): Path2D {
  const path = new Path2D()
  points.forEach((point, index) => {
    if (index === 0) path.moveTo(point.x, point.y)
    else path.lineTo(point.x, point.y)
  })
  path.closePath()
  return path
}

function drawGlass(context: CanvasRenderingContext2D, chamber: Chamber): void {
  const path = pathFrom(chamber.path)

  const fill = context.createLinearGradient(0, chamber.margin, 0, chamber.bottomY)
  fill.addColorStop(0, 'rgba(232, 240, 245, 0.035)')
  fill.addColorStop(0.65, 'rgba(15, 220, 120, 0.03)')
  fill.addColorStop(1, 'rgba(15, 220, 120, 0.075)')
  context.fillStyle = fill
  context.fill(path)

  context.lineJoin = 'round'
  context.lineCap = 'round'

  // 玻璃厚度：外层暗、内层亮，形成壁厚感
  context.strokeStyle = 'rgba(232, 240, 245, 0.055)'
  context.lineWidth = WALL_THICKNESS
  context.stroke(path)

  context.strokeStyle = 'rgba(180, 253, 217, 0.2)'
  context.lineWidth = WALL_THICKNESS - 6
  context.stroke(path)

  context.strokeStyle = 'rgba(180, 253, 217, 0.5)'
  context.lineWidth = 1.6
  context.stroke(path)

  // 左上高光弧
  const highlightR = chamber.cornerR - WALL_THICKNESS * 0.55
  context.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  context.lineWidth = 5
  context.beginPath()
  context.arc(
    chamber.margin + chamber.cornerR,
    chamber.cornerY,
    highlightR,
    Math.PI * 1.05,
    Math.PI * 1.4,
  )
  context.stroke()

  context.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  context.lineWidth = 2.5
  context.beginPath()
  context.arc(
    chamber.margin + chamber.cornerR,
    chamber.cornerY,
    highlightR,
    Math.PI * 1.46,
    Math.PI * 1.62,
  )
  context.stroke()

  // 顶部平面的一道横向反光
  const topGlow = context.createLinearGradient(
    chamber.margin,
    chamber.margin,
    chamber.width - chamber.margin,
    chamber.margin,
  )
  topGlow.addColorStop(0, 'rgba(255, 255, 255, 0)')
  topGlow.addColorStop(0.35, 'rgba(255, 255, 255, 0.16)')
  topGlow.addColorStop(0.65, 'rgba(255, 255, 255, 0.1)')
  topGlow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.strokeStyle = topGlow
  context.lineWidth = 2.5
  context.beginPath()
  context.moveTo(chamber.margin + chamber.cornerR, chamber.margin + 5)
  context.lineTo(chamber.width - chamber.margin - chamber.cornerR, chamber.margin + 5)
  context.stroke()
}

function drawFunnelGlow(context: CanvasRenderingContext2D, chamber: Chamber): void {
  const radius = 150
  const glow = context.createRadialGradient(
    chamber.cx,
    chamber.bottomY,
    0,
    chamber.cx,
    chamber.bottomY,
    radius,
  )
  glow.addColorStop(0, 'rgba(15, 220, 120, 0.22)')
  glow.addColorStop(1, 'rgba(15, 220, 120, 0)')
  context.fillStyle = glow
  context.fillRect(chamber.cx - radius, chamber.bottomY - radius, radius * 2, radius * 2)
}

function drawGate(context: CanvasRenderingContext2D, gate: Body): void {
  const width = EXIT_GAP / 2
  const height = GATE_THICKNESS
  context.save()
  context.translate(gate.position.x, gate.position.y)
  context.rotate(gate.angle)
  const gradient = context.createLinearGradient(0, -height / 2, 0, height / 2)
  gradient.addColorStop(0, 'rgba(180, 253, 217, 0.85)')
  gradient.addColorStop(1, 'rgba(2, 116, 59, 0.85)')
  context.fillStyle = gradient
  context.fillRect(-width / 2, -height / 2, width, height)
  context.strokeStyle = 'rgba(232, 240, 245, 0.5)'
  context.lineWidth = 1
  context.strokeRect(-width / 2, -height / 2, width, height)
  context.restore()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}