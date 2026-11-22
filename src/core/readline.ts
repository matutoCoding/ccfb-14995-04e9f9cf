import { simulate, speedToReach } from "./physics"
import type { HoleTarget, PuttEnv, SimResult } from "./physics"
import type { HeightFieldData, Vec2 } from "./types"

export interface AimOption {
  speed: number // 出手速度
  aim: Vec2 // 瞄准点
  sim: SimResult
}

// 轨迹上距洞最近的点
const closestPoint = (sim: SimResult, hole: Vec2): Vec2 => {
  let best = sim.points[0]
  let bd = Infinity
  for (const p of sim.points) {
    const d = Math.hypot(p.x - hole.x, p.y - hole.y)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}

// 在指定速度下尝试找到能进洞的瞄准点,找不到返回 null
const tryHoleAtSpeed = (
  field: HeightFieldData,
  env: PuttEnv,
  from: Vec2,
  hole: HoleTarget,
  speed: number,
): AimOption | null => {
  const ux = hole.x - from.x
  const uy = hole.y - from.y
  const d = Math.hypot(ux, uy)
  if (d < 0.05) return null
  const dir = { x: ux / d, y: uy / d }
  const perp = { x: -dir.y, y: dir.x }
  const tryOffset = (o: number): SimResult => {
    const aim = { x: hole.x + perp.x * o, y: hole.y + perp.y * o }
    const ax = aim.x - from.x
    const ay = aim.y - from.y
    return simulate(field, env, from, { x: ax, y: ay }, speed, hole)
  }
  const signedMiss = (sim: SimResult): number => {
    const p = closestPoint(sim, hole)
    return (p.x - hole.x) * perp.x + (p.y - hole.y) * perp.y
  }
  const direct = tryOffset(0)
  if (direct.outcome === "holed") return { speed, aim: { x: hole.x, y: hole.y }, sim: direct }
  // 扫描找变号区间
  const maxOffset = Math.min(d * 0.8, 6)
  let prevO = 0
  let prevM = signedMiss(direct)
  let lo: number | null = null
  let hi: number | null = null
  for (let k = 1; k <= 24; k++) {
    const o = (k / 24) * maxOffset * Math.sign(-prevM || 1)
    const sim = tryOffset(o)
    if (sim.outcome === "holed") {
      return { speed, aim: { x: hole.x + perp.x * o, y: hole.y + perp.y * o }, sim }
    }
    const m = signedMiss(sim)
    if (m * prevM < 0) {
      lo = prevO
      hi = o
      break
    }
    prevO = o
    prevM = m
  }
  if (lo === null || hi === null) return null
  // 二分
  for (let it = 0; it < 16; it++) {
    const mid = (lo + hi) / 2
    const sim = tryOffset(mid)
    if (sim.outcome === "holed") {
      return { speed, aim: { x: hole.x + perp.x * mid, y: hole.y + perp.y * mid }, sim }
    }
    if (signedMiss(sim) * prevM > 0) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return null
}

// 多档速度的读线方案:先找最低可进洞速度,再给出更扎实的档位
// 弯线推杆路径更长,贴洞速度会停在洞前;过快又会擦洞,所以逐档试探
export const findAimOptions = (
  field: HeightFieldData,
  env: PuttEnv,
  from: Vec2,
  holePos: Vec2,
  cupRadius: number,
  capture: number,
): AimOption[] => {
  const hole: HoleTarget = { x: holePos.x, y: holePos.y, r: cupRadius, capture }
  const base = Math.min(speedToReach(field, env, from, holePos), 4.5)
  // 最低可进洞速度
  let vMin: number | null = null
  let first: AimOption | null = null
  for (let k = 0; k <= 16; k++) {
    const v = base * (1 + k * 0.03)
    const opt = tryHoleAtSpeed(field, env, from, hole, v)
    if (opt) {
      vMin = v
      first = opt
      break
    }
  }
  if (vMin === null || !first) return []
  const out: AimOption[] = [first]
  // 更扎实的档位,太快进不了就跳过
  for (const dv of [0.3, 0.6]) {
    const opt = tryHoleAtSpeed(field, env, from, hole, vMin + dv)
    if (opt) out.push(opt)
  }
  return out
}

// 三推风险图:从各点向洞杯推,速度微小误差下的停球散布越大风险越高
export const threePuttRisk = (
  field: HeightFieldData,
  env: PuttEnv,
  holePos: Vec2,
  cupRadius: number,
  capture: number,
  n = 14,
): { n: number; values: number[] } => {
  const hole: HoleTarget = { x: holePos.x, y: holePos.y, r: cupRadius, capture }
  const values = new Array<number>(n * n).fill(0)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * field.width
      const y = ((j + 0.5) / n) * field.height
      const d = Math.hypot(x - holePos.x, y - holePos.y)
      if (d < 3) continue
      const from = { x, y }
      const base = speedToReach(field, env, from, holePos)
      let worst = 0
      for (const k of [-1, 0, 1]) {
        const sp = base * (1 + k * 0.06)
        const sim = simulate(field, env, from, { x: holePos.x - x, y: holePos.y - y }, sp, hole)
        const miss = sim.outcome === "holed" ? 0 : Math.max(sim.closest, Math.hypot(sim.endX - holePos.x, sim.endY - holePos.y))
        worst = Math.max(worst, miss)
      }
      // 距离越远、散布越大,风险越高
      const risk = Math.min(Math.max((worst - 0.4) / 1.6, 0), 1) * Math.min(d / 8, 1)
      values[j * n + i] = risk
    }
  }
  return { n, values }
}
