import { fromPoints, heightRange } from "../core/heightfield"
import type { Ctx } from "../main"
import { el } from "../ui/dom"
import { fitCanvas, renderGreen } from "../ui/green2d"
import { Green3D } from "../ui/green3d"

// 果岭档案:按球洞管理,查看地形,导入测量点
export const render = (root: HTMLElement, ctx: Ctx): (() => void) => {
  let view3d: Green3D | null = null
  const state = { color: true, contours: true, arrows: false, mode: "2d" as "2d" | "3d" }

  const green = () => ctx.store.greens.find((g) => g.id === ctx.greenId) ?? ctx.store.greens[0]

  root.append(
    el("h1", { class: "page-title" }, ["果岭档案"]),
    el("p", { class: "page-desc" }, ["按球洞管理十八个果岭,查看地形,导入测量点生成高度场"]),
  )

  const listPanel = el("div", { class: "panel" }, [el("h2", { class: "panel-title" }, ["球洞列表"])])
  const listBox = el("div", { style: "display:flex;flex-direction:column;gap:8px;max-height:70vh;overflow-y:auto" })
  listPanel.append(listBox)

  const right = el("div")
  const layout = el("div", { class: "layout-2" }, [listPanel, right])
  root.append(layout)

  const drawView = () => {
    right.replaceChildren()
    const g = green()
    const toolbar = el("div", { class: "toolbar" })
    const toggle = (label: string, key: "color" | "contours" | "arrows") => {
      const b = el("button", { class: `btn${state[key] ? " active" : ""}` }, [label])
      b.addEventListener("click", () => {
        state[key] = !state[key]
        drawView()
      })
      return b
    }
    toolbar.append(toggle("坡度颜色", "color"), toggle("等高线", "contours"), toggle("坡度箭头", "arrows"))
    const modeBtn = el("button", { class: "btn" }, [state.mode === "2d" ? "切换到 3D" : "切换到 2D"])
    modeBtn.addEventListener("click", () => {
      state.mode = state.mode === "2d" ? "3d" : "2d"
      drawView()
    })
    toolbar.append(modeBtn)

    const wrap = el("div", { class: "canvas-wrap" })
    if (view3d) {
      view3d.dispose()
      view3d = null
    }
    if (state.mode === "2d") {
      const canvas = el("canvas", { class: "green-view" }) as HTMLCanvasElement
      wrap.append(canvas)
      requestAnimationFrame(() => {
        fitCanvas(canvas, g)
        renderGreen(canvas, g, state)
      })
    } else {
      const box = el("div", { class: "view3d" })
      wrap.append(box)
      view3d = new Green3D(box)
      view3d.setGreen(g)
    }

    const range = heightRange(g.field)
    const info = el("div", { class: "panel" }, [
      el("h2", { class: "panel-title" }, [`${g.hole} 号洞 · ${g.name}`]),
      el("div", { class: "row" }, [
        el("span", { class: "tag" }, [`尺寸 ${g.field.width}m × ${g.field.height}m`]),
        el("span", { class: "tag" }, [`高差 ${(range.max - range.min).toFixed(2)}m`]),
        el("span", { class: "tag" }, [`果岭速度 ${g.stimp} 英尺`]),
        el("span", { class: "tag" }, [`草纹强度 ${(g.grainStrength * 100).toFixed(0)}%`]),
      ]),
      el("p", { class: "muted", style: "margin-top:12px" }, [g.note]),
    ])

    // 测量点导入
    const textarea = el("textarea", {
      class: "input",
      rows: "5",
      style: "width:100%;font-family:monospace",
      placeholder: "每行一个测量点:x,y,z(米)\n例如:\n0,0,0\n15,0,0.35\n30,12,0.8",
    }) as HTMLTextAreaElement
    const importBtn = el("button", { class: "btn primary" }, ["导入并生成地形"])
    const importMsg = el("span", { class: "muted" })
    importBtn.addEventListener("click", () => {
      const pts = textarea.value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => {
          const [x, y, z] = line.split(/[,\s]+/).map(Number)
          return { x, y, z }
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))
      if (pts.length < 4) {
        importMsg.textContent = " 至少需要 4 个有效测量点"
        return
      }
      g.field = fromPoints(pts, 72, 72, g.field.width, g.field.height)
      g.updatedAt = new Date().toISOString()
      ctx.save()
      importMsg.textContent = ` 已用 ${pts.length} 个点重建地形`
      drawView()
    })
    const importPanel = el("div", { class: "panel" }, [
      el("h2", { class: "panel-title" }, ["导入测量点"]),
      el("p", { class: "muted" }, ["坐标以果岭前缘左角为原点,单位米。导入后覆盖现有地形,可到「地形编辑」继续手动调整。"]),
      textarea,
      el("div", { class: "row", style: "margin-top:8px" }, [importBtn, importMsg]),
    ])

    right.append(toolbar, wrap, info, importPanel)
  }

  const drawList = () => {
    listBox.replaceChildren()
    for (const g of ctx.store.greens) {
      const item = el("div", { class: `list-item${g.id === ctx.greenId ? " active" : ""}` }, [
        el("div", { style: "font-weight:500" }, [`${g.hole} 号洞 · ${g.name}`]),
        el("div", { class: "muted" }, [`速度 ${g.stimp} · 纹路 ${(g.grainStrength * 100).toFixed(0)}%`]),
      ])
      item.addEventListener("click", () => {
        ctx.setGreen(g.id)
        drawList()
        drawView()
      })
      listBox.append(item)
    }
  }

  drawList()
  drawView()

  return () => {
    if (view3d) view3d.dispose()
  }
}
