import { gradient, sample } from "./heightfield"
import type { HeightFieldData, Vec2 } from "./types"

// 物理常量
export const G = 9.81
export const STIMP_V0 = 1.83 // 测速仪出球速度 m/s
export const FT = 0.3048
export const DT = 1 / 480 // 固定步长,保证确定性
const MAX_T = 40
const RECORD_EVERY = 4 // 每 4 步记录一个轨迹点(120Hz)

// 由果岭速度(英尺)反推滚动摩擦系数:平地停球距离 = v0^2 / (2*mu*g) = stimp
export const muFromStimp = (stimpFt: number) => (STIMP_V0 * STIMP_V0) / (2 * G * stimpFt * FT)

// 某一时刻的环境条件
export interface PuttEnv {
  stimp: number // 已含晨露/干燥修正后的果岭速度
  grainOn: boolean
  grainDir: number // 弧度
  grainStrength: number // 0..1
  grainEffect: number // 0..0.5
}

export interface HoleTarget {
  x: number
  y: number
  r: number
  capture: number // 进洞最大速度
}

export interface TrajPoint {
  x: number
  y: number
  z: number
  t: number
  v: number
}

export type SimOutcome = "holed" | "lipped" | "stopped" | "off" | "timeout"

export interface SimResult {
  points: TrajPoint[]
  outcome: SimOutcome
  endX: number
  endY: number
  distance: number // 滚动路径总长
  time: number
  closest: number // 距洞杯中心最近距离(无洞时为 Infinity)
}

// 确定性推杆模拟:同一 (field, env, start, dir, speed) 输入必然得到逐位相同的结果
export const simulate = (
  field: HeightFieldData,
  env: PuttEnv,
  start: Vec2,
  dir: Vec2,
  speed: number,
  hole?: HoleTarget,
): SimResult => {
  const mu0 = muFromStimp(env.stimp)
  const len = Math.hypot(dir.x, dir.y)
  let x = start.x
  let y = start.y
  let vx = (dir.x / len) * speed
  let vy = (dir.y / len) * speed
  let t = 0
  let dist = 0
  let closest = Infinity
  let lipped = false
  const points: TrajPoint[] = [{ x, y, z: sample(field, x, y), t: 0, v: speed }]
  const maxSteps = Math.round(MAX_T / DT)

  for (let step = 1; step <= maxSteps; step++) {
    const g = gradient(field, x, y)
    const n2 = 1 + g.x * g.x + g.y * g.y
    // 重力沿坡面分量
    const ax = (-G * g.x) / n2
    const ay = (-G * g.y) / n2
    const sp = Math.hypot(vx, vy)
    let fx = 0
    let fy = 0
    if (sp > 1e-9) {
      // 草纹:顺纹摩擦小,逆纹摩擦大
      let mu = mu0
      if (env.grainOn && env.grainStrength > 0) {
        const c = Math.cos(Math.atan2(vy, vx) - env.grainDir)
        mu = mu0 * (1 - env.grainStrength * env.grainEffect * c)
      }
      const fmag = (mu * G) / Math.sqrt(n2)
      fx = (-vx / sp) * fmag
      fy = (-vy / sp) * fmag
    }
    let nvx = vx + (ax + fx) * DT
    let nvy = vy + (ay + fy) * DT
    // 摩擦把速度压过零:静摩擦能抵消坡度就停住,否则由静止重新下滑
    if (sp > 0 && nvx * vx + nvy * vy < 0) {
      const fStatic = (mu0 * G) / Math.sqrt(n2)
      if (Math.hypot(ax, ay) <= fStatic) {
        t += DT
        break
      }
      nvx = ax * DT
      nvy = ay * DT
    }
    vx = nvx
    vy = nvy
    const dx = vx * DT
    const dy = vy * DT
    x += dx
    y += dy
    t += DT
    dist += Math.hypot(dx, dy)
    // 出界
    if (x < 0 || x > field.width || y < 0 || y > field.height) {
      return finish("off")
    }
    // 洞杯判定
    if (hole) {
      const dh = Math.hypot(x - hole.x, y - hole.y)
      if (dh < closest) closest = dh
      if (dh < hole.r) {
        const spNow = Math.hypot(vx, vy)
        if (spNow <= hole.capture) return finish("holed")
        lipped = true
      }
    }
    if (step % RECORD_EVERY === 0) {
      points.push({ x, y, z: sample(field, x, y), t, v: Math.hypot(vx, vy) })
    }
    if (vx === 0 && vy === 0) break
  }
  points.push({ x, y, z: sample(field, x, y), t, v: 0 })
  return finish(lipped ? "lipped" : t >= MAX_T ? "timeout" : "stopped")

  function finish(outcome: SimOutcome): SimResult {
    return { points, outcome, endX: x, endY: y, distance: dist, time: t, closest }
  }
}

// 估算"刚好到洞"的初速:能量法,平地项 + 高差项
export const speedToReach = (field: HeightFieldData, env: PuttEnv, from: Vec2, to: Vec2): number => {
  const mu = muFromStimp(env.stimp)
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  const dh = sample(field, to.x, to.y) - sample(field, from.x, from.y)
  const v2 = 2 * mu * G * d + 2 * G * dh
  return Math.sqrt(Math.max(v2, 0.3))
}

// 物理自检:平地停球距离应对应果岭速度定义,且两次模拟逐位一致
export const selfTest = (stimpFt: number): { expected: number; got: number; deterministic: boolean } => {
  const field: HeightFieldData = { cols: 21, rows: 21, width: 20, height: 20, data: new Array(441).fill(0) }
  const env: PuttEnv = { stimp: stimpFt, grainOn: false, grainDir: 0, grainStrength: 0, grainEffect: 0 }
  const run = () =>
    simulate(field, env, { x: 1, y: 10 }, { x: 1, y: 0 }, STIMP_V0)
  const a = run()
  const b = run()
  return {
    expected: stimpFt * FT,
    got: a.distance,
    deterministic: a.endX === b.endX && a.endY === b.endY && a.distance === b.distance,
  }
}
