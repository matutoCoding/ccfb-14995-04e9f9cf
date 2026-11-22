import { checkPin, zoneName, zoneOf } from "../core/planner"
import type { Ctx } from "../main"
import type { DayPlan } from "../core/types"
import { el, select } from "../ui/dom"
import { renderGreen } from "../ui/green2d"

// 赛事果岭图:按洞出图,标注洞位距前缘与侧边的步数,可打印
export const render = (root: HTMLElement, ctx: Ctx): void => {
  const s = ctx.store.settings
  const plans = ctx.store.plans

  root.append(
    el("h1", { class: "page-title" }, ["赛事果岭图"]),
    el("p", { class: "page-desc" }, ["选择一天的洞位方案,按规范生成十八洞果岭图,可直接打印发给选手"]),
  )

  const grid = el("div", { class: "sheet-grid" })
  const empty = el("div", { class: "panel" }, [
    el("p", { class: "muted" }, ["还没有洞位方案。请先到「洞位规划」生成并采用一套方案。"]),
  ])

  const drawCards = (plan: DayPlan) => {
    grid.replaceChildren()
    for (const g of ctx.store.greens) {
      const pin = plan.pins[g.id]
      if (!pin) continue
      const canvas = el("canvas", { class: "green-view" }) as HTMLCanvasElement
      const aspect = g.field.height / g.field.width
      canvas.width = 600
      canvas.height = Math.round(600 * aspect)
      renderGreen(canvas, g, {
        color: false,
        contours: true,
        arrows: false,
        pins: [{ x: pin.x, y: pin.y }],
      })
      const front = pin.y / s.paceLength
      const leftD = pin.x / s.paceLength
      const rightD = (g.field.width - pin.x) / s.paceLength
      const side = leftD <= rightD ? `左 ${leftD.toFixed(0)} 步` : `右 ${rightD.toFixed(0)} 步`
      const check = checkPin(g, s, pin.x, pin.y)
      const card = el("div", { class: "sheet-card" }, [
        el("h3", {}, [`第 ${g.hole} 洞 · ${g.name}`]),
        canvas,
        el("div", { class: "row", style: "margin-top:8px" }, [
          el("span", { class: "tag" }, [`距前缘 ${front.toFixed(0)} 步`]),
          el("span", { class: "tag" }, [`距${side}`]),
          el("span", { class: "tag" }, [zoneName(zoneOf(g, pin.x, pin.y))]),
          el("span", { class: `tag ${check.ok ? "ok" : "bad"}` }, [`坡度 ${check.maxSlope.toFixed(1)}%`]),
        ]),
      ])
      grid.append(card)
    }
  }

  if (plans.length === 0) {
    root.append(empty)
    return
  }

  const options = plans.map((p) => ({ value: p.id, label: p.name }))
  let current = plans[plans.length - 1]
  const planSelect = select(options, current.id, (id) => {
    const found = plans.find((p) => p.id === id)
    if (found) {
      current = found
      drawCards(current)
    }
  })
  const printBtn = el("button", { class: "btn primary" }, ["打印"])
  printBtn.addEventListener("click", () => window.print())
  root.append(el("div", { class: "toolbar no-print" }, [el("span", { class: "muted" }, ["方案"]), planSelect, printBtn]), grid)
  drawCards(current)
}
