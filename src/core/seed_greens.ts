import { makeField, smooth } from "./heightfield"
import type { Green, HeightFieldData } from "./types"

// 确定性伪随机,种子固定则果岭固定
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

const DEG = Math.PI / 180

interface GreenSpec {
  name: string
  kind: "tier" | "slope" | "flat" | "saddle" | "bowl" | "ridge"
  size: [number, number]
  tilt: number // 主坡 %
  tiltDir: number // 度
  grain: number
  grainDir: number // 度
  stimp: number
  note: string
}

const SPECS: GreenSpec[] = [
  { name: "双层台", kind: "tier", size: [30, 26], tilt: 1.2, tiltDir: 90, grain: 0.3, grainDir: 90, stimp: 10, note: "前后两级台面,交界处陡坡,洞位别放过渡带" },
  { name: "大斜坡", kind: "slope", size: [28, 24], tilt: 3.6, tiltDir: 60, grain: 0.4, grainDir: 60, stimp: 10.5, note: "整体大斜坡,高速推杆停不住,考验洞位选择" },
  { name: "平地重纹", kind: "flat", size: [32, 26], tilt: 0.4, tiltDir: 0, grain: 0.9, grainDir: 180, stimp: 9.5, note: "几乎纯平但草纹极重,顺逆纹速度差明显" },
  { name: "马鞍", kind: "saddle", size: [30, 26], tilt: 1.0, tiltDir: 45, grain: 0.35, grainDir: 0, stimp: 10, note: "中间低两侧高,过洞推杆会回拐" },
  { name: "浅碗", kind: "bowl", size: [26, 24], tilt: 0.6, tiltDir: 120, grain: 0.3, grainDir: 270, stimp: 9, note: "四周向中间汇,进洞容错高" },
  { name: "屋脊", kind: "ridge", size: [30, 25], tilt: 1.5, tiltDir: 0, grain: 0.4, grainDir: 90, stimp: 10, note: "中央一道脊线,左右分坡" },
  { name: "斜台", kind: "tier", size: [28, 24], tilt: 1.8, tiltDir: 30, grain: 0.3, grainDir: 200, stimp: 10.5, note: "斜向双层台" },
  { name: "缓坡", kind: "slope", size: [30, 26], tilt: 2.2, tiltDir: 100, grain: 0.35, grainDir: 45, stimp: 10, note: "均匀缓坡" },
  { name: "平纹轻", kind: "flat", size: [28, 24], tilt: 0.5, tiltDir: 80, grain: 0.2, grainDir: 0, stimp: 11, note: "平而快,适合比赛" },
  { name: "双丘", kind: "saddle", size: [32, 26], tilt: 1.2, tiltDir: 150, grain: 0.4, grainDir: 120, stimp: 9.5, note: "两处丘包夹着低带" },
  { name: "深碗", kind: "bowl", size: [27, 25], tilt: 0.8, tiltDir: 200, grain: 0.3, grainDir: 10, stimp: 9, note: "汇水碗形" },
  { name: "长脊", kind: "ridge", size: [34, 24], tilt: 1.0, tiltDir: 90, grain: 0.45, grainDir: 0, stimp: 10, note: "纵向长脊" },
  { name: "硬斜", kind: "slope", size: [26, 24], tilt: 3.0, tiltDir: 320, grain: 0.5, grainDir: 320, stimp: 11, note: "快而斜,下坡推极快" },
  { name: "碎波", kind: "flat", size: [30, 26], tilt: 0.7, tiltDir: 45, grain: 0.55, grainDir: 90, stimp: 10, note: "细碎起伏,线路难读" },
  { name: "前檐", kind: "slope", size: [29, 25], tilt: 2.0, tiltDir: 270, grain: 0.3, grainDir: 270, stimp: 10.5, note: "前缘假檐,短杆易回滚" },
  { name: "错台", kind: "tier", size: [31, 25], tilt: 1.4, tiltDir: 210, grain: 0.35, grainDir: 160, stimp: 10, note: "左右错台" },
  { name: "浅鞍", kind: "saddle", size: [28, 26], tilt: 0.9, tiltDir: 75, grain: 0.3, grainDir: 300, stimp: 9.5, note: "浅马鞍" },
  { name: "冠军", kind: "ridge", size: [33, 27], tilt: 1.8, tiltDir: 135, grain: 0.4, grainDir: 225, stimp: 11.5, note: "大赛果岭,快而多变" },
]

// 按类型生成地形
const buildField = (spec: GreenSpec, seed: number): HeightFieldData => {
  const [w, h] = spec.size
  const f = makeField(72, 72, w, h)
  const rand = mulberry32(seed)
  const tiltX = (spec.tilt / 100) * Math.cos(spec.tiltDir * DEG)
  const tiltY = (spec.tilt / 100) * Math.sin(spec.tiltDir * DEG)
  // 随机低幅起伏的相位
  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const p3 = rand() * Math.PI * 2
  const smoothstep = (t: number) => t * t * (3 - 2 * t)
  for (let j = 0; j < f.rows; j++) {
    for (let i = 0; i < f.cols; i++) {
      const x = (i / (f.cols - 1)) * w
      const y = (j / (f.rows - 1)) * h
      const nx = x / w
      const ny = y / h
      let z = tiltX * x + tiltY * y
      if (spec.kind === "tier") {
        // 中部过渡带的两级台
        z += 0.45 * smoothstep(Math.min(Math.max((ny - 0.42) / 0.16, 0), 1))
      } else if (spec.kind === "saddle") {
        z += 0.35 * Math.cos(nx * Math.PI * 2 + p1) * 0.5 + 0.2 * Math.sin(ny * Math.PI + p2)
      } else if (spec.kind === "bowl") {
        const dx = nx - 0.5
        const dy = ny - 0.5
        z += 1.6 * (dx * dx + dy * dy)
      } else if (spec.kind === "ridge") {
        z += 0.4 * Math.exp(-Math.pow((nx - 0.5) / 0.18, 2))
      } else if (spec.kind === "flat") {
        z += 0.05 * Math.sin(nx * 9 + p1) * Math.sin(ny * 7 + p2)
      }
      // 通用低幅起伏
      z += 0.06 * Math.sin(nx * 4.1 + p2) * Math.cos(ny * 3.3 + p3)
      z += 0.03 * Math.sin(nx * 11 + p3) * Math.sin(ny * 8.7 + p1)
      f.data[j * f.cols + i] = z
    }
  }
  smooth(f, 2)
  return f
}

export const buildSeedGreens = (): Green[] =>
  SPECS.map((spec, k) => ({
    id: `green-${k + 1}`,
    hole: k + 1,
    name: spec.name,
    field: buildField(spec, 1000 + k * 77),
    grainDir: spec.grainDir * DEG,
    grainStrength: spec.grain,
    stimp: spec.stimp,
    note: spec.note,
    updatedAt: new Date().toISOString(),
  }))
