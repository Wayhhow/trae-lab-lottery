/**
 * 抽奖随机数一律走 crypto，而不是 Math.random。
 * 现场百人活动一旦被质疑「是不是内定」，Math.random 很难自证；
 * crypto 至少能证明用的是操作系统熵源。
 */

function randomUint32(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0]
}

/** 返回 [0, maxExclusive) 的均匀整数，拒绝采样以消除取模偏置 */
export function randomInt(maxExclusive: number): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError('随机上界必须是大于 0 的整数')
  }
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
  let value = randomUint32()
  while (value >= limit) {
    value = randomUint32()
  }
  return value % maxExclusive
}

/** 从非空数组中均匀取一个元素 */
export function pickOne<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError('无法从空数组中抽取')
  }
  return items[randomInt(items.length)] as T
}

/** Fisher–Yates 洗牌，返回新数组 */
export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    const a = result[i] as T
    result[i] = result[j] as T
    result[j] = a
  }
  return result
}