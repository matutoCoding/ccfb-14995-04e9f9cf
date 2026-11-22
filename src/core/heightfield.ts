import type { HeightFieldData, Vec2 } from "./types"

export const makeField = (cols: number, rows: number, width: number, height: number): HeightFieldData => ({
  cols,
  rows,
  width,
  height,
  data: new Array(cols * rows).fill(0),
})

export const cellW = (f: HeightFieldData) => f.width / (f.cols - 1)
export const cellH = (f: HeightFieldData) => f.height / (f.rows - 1)

// 双线性插值取高程,越界钳制到边缘
export const sample = (f: HeightFieldData, x: number, y: number): number => {
  const u = Math.min(Math.max(x / f.width, 0), 1) * (f.cols - 1)
  const v = Math.min(Math.max(y / f.height, 0), 1) * (f.rows - 1)
  const i = Math.min(Math.floor(u), f.cols - 2)
  const j = Math.min(Math.floor(v), f.rows - 2)
  const fu = u - i
  const fv = v - j
  const h00 = f.data[j * f.cols + i]
  const h10 = f.data[j * f.cols + i + 1]
  const h01 = f.data[(j + 1) * f.cols + i]
  const h11 = f.data[(j + 1) * f.cols + i + 1]
  return h00 * (1 - fu) * (1 - fv) + h10 * fu * (1 - fv) + h01 * (1 - fu) * fv + h11 * fu * fv
}

// 双线性插值的解析梯度 dz/dx, dz/dy
export const gradient = (f: HeightFieldData, x: number, y: number): Vec2 => {
  const u = Math.min(Math.max(x / f.width, 0), 1) * (f.cols - 1)
  const v = Math.min(Math.max(y / f.height, 0), 1) * (f.rows - 1)
  const i = Math.min(Math.floor(u), f.cols - 2)
  const j = Math.min(Math.floor(v), f.rows - 2)
  const fu = u - i
  const fv = v - j
  const h00 = f.data[j * f.cols + i]
  const h10 = f.data[j * f.cols + i + 1]
  const h01 = f.data[(j + 1) * f.cols + i]
  const h11 = f.data[(j + 1) * f.cols + i + 1]
  const cw = cellW(f)
  const ch = cellH(f)
  return {
    x: ((h10 - h00) * (1 - fv) + (h11 - h01) * fv) / cw,
    y: ((h01 - h00) * (1 - fu) + (h11 - h10) * fu) / ch,
  }
}

// 坡度百分比
export const slopeAt = (f: HeightFieldData, x: number, y: number): number => {
  const g = gradient(f, x, y)
  return Math.hypot(g.x, g.y) * 100
}

// 以 (x,y) 为圆心 r 半径内的最大坡度
export const maxSlopeAround = (f: HeightFieldData, x: number, y: number, r: number): number => {
  let max = slopeAt(f, x, y)
  const rings = [r * 0.5, r]
  for (const rr of rings) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      max = Math.max(max, slopeAt(f, x + rr * Math.cos(a), y + rr * Math.sin(a)))
    }
  }
  return max
}

// 盒式平滑,编辑和导入后用
export const smooth = (f: HeightFieldData, passes: number): void => {
  const tmp = new Array<number>(f.data.length)
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < f.rows; j++) {
      for (let i = 0; i < f.cols; i++) {
        let sum = 0
        let n = 0
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di
            const jj = j + dj
            if (ii >= 0 && ii < f.cols && jj >= 0 && jj < f.rows) {
              sum += f.data[jj * f.cols + ii]
              n++
            }
          }
        }
        tmp[j * f.cols + i] = sum / n
      }
    }
    for (let k = 0; k < f.data.length; k++) f.data[k] = tmp[k]
  }
}

// 测量点(散射)反距离加权插值成网格,再轻度平滑
export const fromPoints = (
  points: { x: number; y: number; z: number }[],
  cols: number,
  rows: number,
  width: number,
  height: number,
): HeightFieldData => {
  const f = makeField(cols, rows, width, height)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i / (cols - 1)) * width
      const y = (j / (rows - 1)) * height
      let wsum = 0
      let zsum = 0
      for (const p of points) {
        const d2 = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)
        if (d2 < 1e-8) {
          wsum = 1
          zsum = p.z
          break
        }
        const w = 1 / d2
        wsum += w
        zsum += p.z * w
      }
      f.data[j * cols + i] = zsum / wsum
    }
  }
  smooth(f, 2)
  return f
}

// 高程范围
export const heightRange = (f: HeightFieldData): { min: number; max: number } => {
  let min = Infinity
  let max = -Infinity
  for (const h of f.data) {
    if (h < min) min = h
    if (h > max) max = h
  }
  return { min, max }
}

// 选一个"好看"的等高线间距
export const pickContourInterval = (f: HeightFieldData): number => {
  const { min, max } = heightRange(f)
  const raw = (max - min) / 12
  const steps = [0.05, 0.1, 0.2, 0.25, 0.5, 1]
  for (const s of steps) if (raw <= s) return s
  return 2
}

// marching squares,返回线段扁平数组 [x1,y1,x2,y2,...],直接画即可
export const contourSegments = (f: HeightFieldData, level: number): number[] => {
  const segs: number[] = []
  const cw = cellW(f)
  const ch = cellH(f)
  const h = (i: number, j: number) => f.data[j * f.cols + i]
  // 边上的插值点
  const lerp = (a: number, b: number) => (level - a) / (b - a)
  for (let j = 0; j < f.rows - 1; j++) {
    for (let i = 0; i < f.cols - 1; i++) {
      const h00 = h(i, j)
      const h10 = h(i + 1, j)
      const h11 = h(i + 1, j + 1)
      const h01 = h(i, j + 1)
      let idx = 0
      if (h00 > level) idx |= 1
      if (h10 > level) idx |= 2
      if (h11 > level) idx |= 4
      if (h01 > level) idx |= 8
      if (idx === 0 || idx === 15) continue
      const x0 = i * cw
      const y0 = j * ch
      // 四条边上的交点
      const bottom: [number, number] = [x0 + cw * lerp(h00, h10), y0]
      const right: [number, number] = [x0 + cw, y0 + ch * lerp(h10, h11)]
      const top: [number, number] = [x0 + cw * lerp(h01, h11), y0 + ch]
      const left: [number, number] = [x0, y0 + ch * lerp(h00, h01)]
      const push = (a: [number, number], b: [number, number]) => segs.push(a[0], a[1], b[0], b[1])
      switch (idx) {
        case 1: case 14: push(left, bottom); break
        case 2: case 13: push(bottom, right); break
        case 3: case 12: push(left, right); break
        case 4: case 11: push(right, top); break
        case 6: case 9: push(bottom, top); break
        case 7: case 8: push(left, top); break
        case 5: push(left, bottom); push(right, top); break
        case 10: push(bottom, right); push(left, top); break
      }
    }
  }
  return segs
}
