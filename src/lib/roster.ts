import type { Candidate } from '@/types'

export interface ParseResult {
  candidates: Candidate[]
  /** 因重复被跳过的行数 */
  duplicates: number
}

/**
 * 解析整段粘贴的名单。
 * 支持两种行格式：
 *   001 张三
 *   张三
 * 编号与姓名之间允许 空格 / 制表符 / . 、 , ， : ： - 等分隔符。
 */
export function parseRoster(text: string): ParseResult {
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  let duplicates = 0

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const matched = /^(\d{1,6})\s*[.、,，:：\-—]?\s*(.+)$/.exec(line)
    const no = matched ? matched[1]! : ''
    const name = (matched ? matched[2]! : line).trim()
    if (!name) continue

    const fingerprint = `${no}\u0000${name}`
    if (seen.has(fingerprint)) {
      duplicates += 1
      continue
    }
    seen.add(fingerprint)

    candidates.push({
      id: crypto.randomUUID(),
      no,
      name,
    })
  }

  return { candidates, duplicates }
}

/** 新建一条空白候选人记录 */
export function createCandidate(no = '', name = ''): Candidate {
  return { id: crypto.randomUUID(), no, name }
}