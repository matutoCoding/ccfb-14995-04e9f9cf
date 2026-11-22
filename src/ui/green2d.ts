import { contourSegments, gradient, heightRange, pickContourInterval, slopeAt } from "../core/heightfield"
import type { Green } from "../core/types"

// 场地图坐标(米,原点在左下角)到画布像素的变换
export interface Transform {
  scale: number
  ox: number
  oy: number
  w: number
  h: number
}

export const makeTransform = (canvas: HTMLCanvasElement, green: Green): Transform => {
  const pad = 28
  const f = green.field
  const w = canvas.width
  const h = canvas.height
  const scale = Math.min((w - pad * 2) / f.width, (h - pad * 2) / f.height)
  return {
    scale,
    ox: (w - f.width * scale) / 2,
    oy: (h - f.height * scale) / 2,
    w,
    h,
  }
}

export const toCanvas = (t: Transform, green: Green, x: number, y: number) => ({
  px: t.ox + x * t.scale,
  py: t.oy + (green.field.height - y) * t.scale,
})

export const toField = (t: Transform, green: Green, px: number, py: number) => ({
  x: (px - t.ox) / t.scale,
  y: green.field.height - (py - t.oy) / t.scale,
})

// 按容器宽度与场地纵横比设置画布尺寸(含高分屏)
export const fitCanvas = (canvas: HTMLCanvasElement, green: Green): void => {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || 800
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(((w * green.field.height) / green.field.width) * dpr)
  canvas.style.height = `${(w * green.field.height) / green.field.width}px`
}

// 鼠标事件坐标转场地坐标
export const eventToField = (canvas: HTMLCanvasElement, green: Green, e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect()
  const dpr = canvas.width / rect.width
  const t = makeTransform(canvas, green)
  return toField(t, green, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr)
}

export interface PinMark {
  x: number
  y: number
  label?: string
  color?: string
}

export interface PathMark {
  pts: { x: number; y: number }[]
  color?: string
  width?: number
}

export interface ViewOptions {
  color: boolean
  contours: boolean
  arrows: boolean
  mask?: { n: number; values: boolean[] }
  risk?: { n: number; values: number[] }
  pins?: PinMark[]
  paths?: PathMark[]
}

// 坡度到颜色:0% 浅草绿 -> 3% 琥珀 -> 6%+ 红
const slopeColor = (pct: number): [number, number, number] => {
  const t = Math.min(pct / 6, 1)
  const hue = 145 - t * 145
  const sat = 45 + t * 25
  const lig = 78 - t * 28
  return hsl(hue, sat, lig)
}

const hsl = (h: number, s: number, l: number): [number, number, number] => {
  const a = (s * Math.min(l, 100 - l)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * ((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) / 100))
  }
  return [f(0), f(8), f(4)]
}

export const renderGreen = (canvas: HTMLCanvasElement, green: Green, opts: ViewOptions): void => {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const f = green.field
  const t = makeTransform(canvas, green)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "#f4f6f4"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 坡度着色层:离屏低分辨率画布放大
  if (opts.color) {
    const off = document.createElement("canvas")
    off.width = f.cols
    off.height = f.rows
    const octx = off.getContext("2d")
    if (octx) {
      const img = octx.createImageData(f.cols, f.rows)
      for (let j = 0; j < f.rows; j++) {
        for (let i = 0; i < f.cols; i++) {
          const x = (i / (f.cols - 1)) * f.width
          const y = (j / (f.rows - 1)) * f.height
          const [r, g, b] = slopeColor(slopeAt(f, x, y))
          // 画布行与场地 y 方向相反
          const k = ((f.rows - 1 - j) * f.cols + i) * 4
          img.data[k] = r
          img.data[k + 1] = g
          img.data[k + 2] = b
          img.data[k + 3] = 255
        }
      }
      octx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = true
      const p0 = toCanvas(t, green, 0, f.height)
      ctx.drawImage(off, p0.px, p0.py, f.width * t.scale, f.height * t.scale)
    }
  } else {
    const p0 = toCanvas(t, green, 0, f.height)
    ctx.fillStyle = "#e3ede5"
    ctx.fillRect(p0.px, p0.py, f.width * t.scale, f.height * t.scale)
  }

  // 合规掩膜:不可放洞杯区域盖红
  if (opts.mask) {
    const { n, values } = opts.mask
    const cw = (f.width / n) * t.scale
    const ch = (f.height / n) * t.scale
    ctx.fillStyle = "rgba(200, 40, 40, 0.28)"
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (values[j * n + i]) continue
        const x = (i / n) * f.width
        const y = (j / n) * f.height
        const p = toCanvas(t, green, x, y)
        ctx.fillRect(p.px, p.py - ch, cw + 0.5, ch + 0.5)
      }
    }
  }

  // 三推风险热力
  if (opts.risk) {
    const { n, values } = opts.risk
    const cw = (f.width / n) * t.scale
    const ch = (f.height / n) * t.scale
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = values[j * n + i]
        if (v <= 0.02) continue
        ctx.fillStyle = `rgba(220, 60, 30, ${(v * 0.55).toFixed(3)})`
        const x = (i / n) * f.width
        const y = (j / n) * f.height
        const p = toCanvas(t, green, x, y)
        ctx.fillRect(p.px, p.py - ch, cw + 0.5, ch + 0.5)
      }
    }
  }

  // 等高线
  if (opts.contours) {
    const { min, max } = heightRange(f)
    const interval = pickContourInterval(f)
    ctx.lineWidth = 1
    let li = 0
    for (let level = Math.ceil(min / interval) * interval; level <= max; level += interval) {
      const segs = contourSegments(f, level)
      const major = li % 5 === 0
      ctx.strokeStyle = major ? "rgba(30, 60, 40, 0.5)" : "rgba(30, 60, 40, 0.22)"
      ctx.lineWidth = major ? 1.4 : 0.8
      ctx.beginPath()
      for (let k = 0; k < segs.length; k += 4) {
        const a = toCanvas(t, green, segs[k], segs[k + 1])
        const b = toCanvas(t, green, segs[k + 2], segs[k + 3])
        ctx.moveTo(a.px, a.py)
        ctx.lineTo(b.px, b.py)
      }
      ctx.stroke()
      li++
    }
  }

  // 坡度箭头,指向下坡
  if (opts.arrows) {
    const n = 12
    ctx.strokeStyle = "rgba(20, 50, 35, 0.65)"
    ctx.fillStyle = "rgba(20, 50, 35, 0.65)"
    ctx.lineWidth = 1.2
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * f.width
        const y = ((j + 0.5) / n) * f.height
        const g = gradient(f, x, y)
        const mag = Math.hypot(g.x, g.y)
        if (mag < 0.003) continue
        const len = Math.min(mag * 900, 14) + 3
        const p = toCanvas(t, green, x, y)
        const dx = (-g.x / mag) * len
        const dy = (g.y / mag) * len
        ctx.beginPath()
        ctx.moveTo(p.px - dx / 2, p.py - dy / 2)
        ctx.lineTo(p.px + dx / 2, p.py + dy / 2)
        ctx.stroke()
        // 箭头头部
        const ang = Math.atan2(dy, dx)
        ctx.beginPath()
        ctx.moveTo(p.px + dx / 2, p.py + dy / 2)
        ctx.lineTo(p.px + dx / 2 - 4 * Math.cos(ang - 0.5), p.py + dy / 2 - 4 * Math.sin(ang - 0.5))
        ctx.lineTo(p.px + dx / 2 - 4 * Math.cos(ang + 0.5), p.py + dy / 2 - 4 * Math.sin(ang + 0.5))
        ctx.closePath()
        ctx.fill()
      }
    }
  }

  // 边框
  const bp = toCanvas(t, green, 0, f.height)
  ctx.strokeStyle = "#9fb3a6"
  ctx.lineWidth = 1.5
  ctx.strokeRect(bp.px, bp.py, f.width * t.scale, f.height * t.scale)

  // 轨迹
  for (const path of opts.paths ?? []) {
    if (path.pts.length < 2) continue
    ctx.strokeStyle = path.color ?? "#1d4ed8"
    ctx.lineWidth = path.width ?? 2
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.beginPath()
    path.pts.forEach((pt, k) => {
      const p = toCanvas(t, green, pt.x, pt.y)
      if (k === 0) ctx.moveTo(p.px, p.py)
      else ctx.lineTo(p.px, p.py)
    })
    ctx.stroke()
  }

  // 洞杯/标记点
  for (const pin of opts.pins ?? []) {
    const p = toCanvas(t, green, pin.x, pin.y)
    const c = pin.color ?? "#b91c1c"
    ctx.fillStyle = "#ffffff"
    ctx.strokeStyle = c
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.px, p.py, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(p.px, p.py, 2.2, 0, Math.PI * 2)
    ctx.fill()
    if (pin.label) {
      ctx.fillStyle = "#1f2937"
      ctx.font = "12px system-ui, sans-serif"
      ctx.textAlign = "left"
      ctx.fillText(pin.label, p.px + 9, p.py - 7)
    }
  }

  // 草纹方向指示(右上角)
  const gx = canvas.width - 46
  const gy = 30
  ctx.strokeStyle = "#4b5563"
  ctx.fillStyle = "#4b5563"
  ctx.lineWidth = 1.5
  const gl = 16
  const gdx = Math.cos(green.grainDir) * gl
  const gdy = -Math.sin(green.grainDir) * gl
  ctx.beginPath()
  ctx.moveTo(gx - gdx, gy - gdy)
  ctx.lineTo(gx + gdx, gy + gdy)
  ctx.stroke()
  const ga = Math.atan2(gdy, gdx)
  ctx.beginPath()
  ctx.moveTo(gx + gdx, gy + gdy)
  ctx.lineTo(gx + gdx - 6 * Math.cos(ga - 0.45), gy + gdy - 6 * Math.sin(ga - 0.45))
  ctx.lineTo(gx + gdx - 6 * Math.cos(ga + 0.45), gy + gdy - 6 * Math.sin(ga + 0.45))
  ctx.closePath()
  ctx.fill()
  ctx.font = "11px system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("草纹", gx, gy + 26)
}
