import { ROUND_META, getPrizeGroups, prizeTierOf } from '@/config/rounds'
import type { WinRecord } from '@/types'

const pad = (value: number) => String(value).padStart(2, '0')

/** 精确到秒的开奖时间 */
export function formatTime(at: number): string {
  const date = new Date(at)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** 旧数据可能没存等级，这里按当前配置补算 */
export function tierOf(record: WinRecord): string {
  if (record.prizeTier) return record.prizeTier
  return prizeTierOf(getPrizeGroups(record.roundId), record.groupId)
}

export const CSV_HEADER = ['序号', '开奖时间', '抽奖环节', '奖品名称', '奖品等级', '编号', '姓名']

export function buildCsv(records: readonly WinRecord[], withHeader = true): string {
  const rows = records.map((record, index) => [
    String(index + 1),
    formatTime(record.at),
    ROUND_META[record.roundId].title,
    record.groupName,
    tierOf(record),
    record.candidateNo,
    record.candidateName,
  ])
  const lines = withHeader ? [CSV_HEADER, ...rows] : rows
  return lines.map((cells) => cells.map(escapeCsvCell).join(',')).join('\r\n')
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** 纯文本清单，用于一键复制到聊天窗口或文档 */
export function buildPlainText(records: readonly WinRecord[]): string {
  if (records.length === 0) return '（暂无中奖记录）'
  return records
    .map((record, index) => {
      const no = record.candidateNo ? `${record.candidateNo} ` : ''
      return `${index + 1}. ${formatTime(record.at)} [${ROUND_META[record.roundId].title}] ${record.groupName}（${tierOf(record)}） ${no}${record.candidateName}`
    })
    .join('\n')
}

/** 复制到剪贴板：非安全上下文下退回 execCommand */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到下面的兜底方案
  }

  try {
    const holder = document.createElement('textarea')
    holder.value = text
    holder.style.position = 'fixed'
    holder.style.opacity = '0'
    document.body.appendChild(holder)
    holder.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(holder)
    return ok
  } catch {
    return false
  }
}

/** 下载 CSV：带 BOM，保证 Excel 正确识别 UTF-8 中文 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}