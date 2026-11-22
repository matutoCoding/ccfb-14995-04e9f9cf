import { maxSlopeAround } from "./heightfield"
import type { Green, HistoryEntry, PinPos, Settings } from "./types"

export interface PinCheck {
  ok: boolean
  maxSlope: number
  reasons: string[]
}

// 洞位合规检查:边缘距离 + 半径内最大坡度
export const checkPin = (green: Green, s: Settings, x: number, y: number): PinCheck => {
  const reasons: string[] = []
  const f = green.field
  const mx = Math.min(x, f.width - x)
  const my = Math.min(y, f.height - y)
  if (mx < s.edgeMargin || my < s.edgeMargin) {
    reasons.push(`距边缘不足 ${s.edgeMargin}m`)
  }
  const maxSlope = maxSlopeAround(f, x, y, s.pinRadius)
  if (maxSlope > s.maxPinSlope) {
    reasons.push(`${s.pinRadius}m 内最大坡度 ${maxSlope.toFixed(1)}% 超过 ${s.maxPinSlope}%`)
  }
  return { ok: reasons.length === 0, maxSlope, reasons }
}

// 合规掩膜,用于地图叠加显示(红区不可放)
export const validityGrid = (green: Green, s: Settings, n: number): boolean[] => {
  const f = green.field
  const mask = new Array<boolean>(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * f.width
      const y = ((j + 0.5) / n) * f.height
      mask[j * n + i] = checkPin(green, s, x, y).ok
    }
  }
  return mask
}

// 左中右 x 前中后 九宫分区
export interface Zone {
  lr: 0 | 1 | 2 // 左中右
  fb: 0 | 1 | 2 // 前中后
}

export const zoneOf = (green: Green, x: number, y: number): Zone => {
  const nx = x / green.field.width
  const ny = y / green.field.height
  const lr = (nx < 1 / 3 ? 0 : nx < 2 / 3 ? 1 : 2) as 0 | 1 | 2
  const fb = (ny < 1 / 3 ? 0 : ny < 2 / 3 ? 1 : 2) as 0 | 1 | 2
  return { lr, fb }
}

export const zoneName = (z: Zone): string => {
  const lr = ["左", "中", "右"][z.lr]
  const fb = ["前", "中", "后"][z.fb]
  return `${fb}${lr}`
}

// 字符串哈希,做确定性种子
const hashStr = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 在指定分区内找最优合规洞位:离历史洞位越远越好,略偏分区中心
const pickInZone = (
  green: Green,
  s: Settings,
  zone: Zone,
  history: HistoryEntry[],
  rand: () => number,
): PinPos => {
  const f = green.field
  const x0 = (zone.lr / 3) * f.width
  const x1 = ((zone.lr + 1) / 3) * f.width
  const y0 = (zone.fb / 3) * f.height
  const y1 = ((zone.fb + 1) / 3) * f.height
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  let best: PinPos = { x: cx, y: cy }
  let bestScore = -Infinity
  for (let k = 0; k < 300; k++) {
    const x = x0 + rand() * (x1 - x0)
    const y = y0 + rand() * (y1 - y0)
    if (!checkPin(green, s, x, y).ok) continue
    let minHist = Infinity
    for (const h of history) {
      if (h.greenId !== green.id) continue
      minHist = Math.min(minHist, Math.hypot(h.x - x, h.y - y))
    }
    if (minHist === Infinity) minHist = 20
    const centerDist = Math.hypot(x - cx, y - cy)
    const score = Math.min(minHist, 12) - centerDist * 0.3
    if (score > bestScore) {
      bestScore = score
      best = { x, y }
    }
  }
  if (bestScore > -Infinity) return best
  // 分区内无合规点,退而在全果岭找
  for (let k = 0; k < 600; k++) {
    const x = rand() * f.width
    const y = rand() * f.height
    if (checkPin(green, s, x, y).ok) return { x, y }
  }
  return { x: f.width / 2, y: f.height / 2 }
}

// 自动生成若干套十八洞方案:九宫格每格恰好用两次,左右/前后自然均衡
export const generatePlans = (
  greens: Green[],
  s: Settings,
  history: HistoryEntry[],
  dateStr: string,
  count: number,
): Record<string, PinPos>[] => {
  const plans: Record<string, PinPos>[] = []
  for (let p = 0; p < count; p++) {
    const rand = mulberry32(hashStr(`${dateStr}#${p}`))
    // 18 个分区指派:9 宫各两次
    const zones: Zone[] = []
    for (let fb = 0; fb < 3; fb++) {
      for (let lr = 0; lr < 3; lr++) {
        zones.push({ lr: lr as 0 | 1 | 2, fb: fb as 0 | 1 | 2 })
        zones.push({ lr: lr as 0 | 1 | 2, fb: fb as 0 | 1 | 2 })
      }
    }
    // 洗牌
    for (let i = zones.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const t = zones[i]
      zones[i] = zones[j]
      zones[j] = t
    }
    const pins: Record<string, PinPos> = {}
    greens.forEach((green, k) => {
      pins[green.id] = pickInZone(green, s, zones[k % zones.length], history, rand)
    })
    plans.push(pins)
  }
  return plans
}

// 踩踏磨损提醒:周期内同一半径内使用次数超限
export const wearWarning = (
  greenId: string,
  pos: PinPos,
  history: HistoryEntry[],
  s: Settings,
  date: string,
): string | null => {
  const dayMs = 86400000
  const t0 = new Date(date).getTime()
  let uses = 0
  for (const h of history) {
    if (h.greenId !== greenId) continue
    const dt = Math.abs(t0 - new Date(h.date).getTime())
    if (dt > s.wearDays * dayMs) continue
    if (Math.hypot(h.x - pos.x, h.y - pos.y) <= s.wearRadius) uses++
  }
  if (uses >= s.wearMaxUses) {
    return `近 ${s.wearDays} 天该区域已使用 ${uses} 次,草面磨损风险高`
  }
  return null
}
