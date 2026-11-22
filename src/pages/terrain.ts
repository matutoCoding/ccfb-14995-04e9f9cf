import { cellH, cellW, sample, smooth } from "../core/heightfield"
import type { Ctx } from "../main"
import { el, labeled, select } from "../ui/dom"
import { eventToField, fitCanvas, renderGreen } from "../ui/green2d"

type Tool = "raise" | "lower" | "smooth" | "flatten"

// 地形编辑:笔刷拉高/压低/平滑/整平
export const render = (root: HTMLElement, ctx: Ctx): void => {
  const state = { tool: "raise" as Tool, radius: 2.5, strength: 0.5 }
  let painting = false
  let flattenZ = 0
  let raf = 0

  const green = () => ctx.store.greens.find((g) => g.id === ctx.greenId) ?? ctx.store.greens[0]

  root.append(
    el("h1", { class: "page-title" }, ["地形编辑"]),
    el("p", { class: "page-desc" }, ["用笔刷在果岭上直接推拉坡度,松开鼠标自动保存"]),
  )

  const greenSelect = select(
    ctx.store.greens.map((g) => ({ value: g.id, label: `${g.hole} 号洞 · ${g.name}` })),
    ctx.greenId,
    (id) => {
      ctx.setGreen(id)
      redraw()
    },
  )

  const toolBtns: Record<Tool, HTMLElement> = {
    raise: el("button", { class: "btn active" }, ["拉高"]),
    lower: el("button", { class: "btn" }, ["压低"]),
    smooth: el("button", { class: "btn" }, ["平滑"]),
    flatten: el("button", { class: "btn" }, ["整平"]),
  }
  const setTool = (t: Tool) => {
    state.tool = t
    for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle("active", k === t)
  }
  ;(Object.keys(toolBtns) as Tool[]).forEach((t) => toolBtns[t].addEventListener("click", () => setTool(t)))

  const radiusInput = el("input", { class: "input", type: "range", min: "1", max: "6", step: "0.5", value: String(state.radius) }) as HTMLInputElement
  const radiusLabel = el("span", { class: "muted" }, [`${state.radius}m`])
  radiusInput.addEventListener("input", () => {
    state.radius = parseFloat(radiusInput.value)
    radiusLabel.textContent = `${state.radius}m`
  })
  const strengthInput = el("input", { class: "input", type: "range", min: "0.1", max: "1", step: "0.1", value: String(state.strength) }) as HTMLInputElement
  strengthInput.addEventListener("input", () => {
    state.strength = parseFloat(strengthInput.value)
  })

  const canvas = el("canvas", { class: "green-view", style: "cursor:crosshair" }) as HTMLCanvasElement
  const wrap = el("div", { class: "canvas-wrap" }, [canvas])

  const side = el("div", { class: "panel" }, [
    el("h2", { class: "panel-title" }, ["工具"]),
    labeled("果岭", greenSelect),
    el("div", { class: "row", style: "margin-bottom:12px" }, Object.values(toolBtns)),
    labeled("笔刷半径", el("div", { class: "row" }, [radiusInput, radiusLabel])),
    labeled("力度", strengthInput),
    el("p", { class: "muted" }, ["整平:以按下时的高度为基准把笔刷范围抹平。平滑:柔化局部起伏。"]),
  ])

  root.append(el("div", { class: "layout-2" }, [side, wrap]))

  const applyBrush = (x: number, y: number) => {
    const g = green()
    const f = g.field
    const cw = cellW(f)
    const ch = cellH(f)
    const r = state.radius
    const amount = state.strength * 0.02
    const i0 = Math.max(0, Math.floor((x - r) / cw))
    const i1 = Math.min(f.cols - 1, Math.ceil((x + r) / cw))
    const j0 = Math.max(0, Math.floor((y - r) / ch))
    const j1 = Math.min(f.rows - 1, Math.ceil((y + r) / ch))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = i * cw
        const py = j * ch
        const d = Math.hypot(px - x, py - y)
        if (d > r) continue
        const w = 0.5 * (1 + Math.cos((Math.PI * d) / r))
        const k = j * f.cols + i
        if (state.tool === "raise") f.data[k] += amount * w
        else if (state.tool === "lower") f.data[k] -= amount * w
        else if (state.tool === "flatten") f.data[k] += (flattenZ - f.data[k]) * 0.35 * w
        else {
          // 平滑:向邻域均值靠拢
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
          f.data[k] += (sum / n - f.data[k]) * 0.6 * w
        }
      }
    }
  }

  const redraw = () => {
    fitCanvas(canvas, green())
    renderGreen(canvas, green(), { color: true, contours: true, arrows: true })
  }

  const scheduleRedraw = () => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      redraw()
    })
  }

  canvas.addEventListener("mousedown", (e) => {
    painting = true
    const p = eventToField(canvas, green(), e)
    flattenZ = sample(green().field, p.x, p.y)
    applyBrush(p.x, p.y)
    scheduleRedraw()
  })
  canvas.addEventListener("mousemove", (e) => {
    if (!painting) return
    const p = eventToField(canvas, green(), e)
    applyBrush(p.x, p.y)
    scheduleRedraw()
  })
  window.addEventListener("mouseup", () => {
    if (!painting) return
    painting = false
    const g = green()
    smooth(g.field, 1)
    g.updatedAt = new Date().toISOString()
    ctx.save()
    scheduleRedraw()
  })

  requestAnimationFrame(redraw)
}
