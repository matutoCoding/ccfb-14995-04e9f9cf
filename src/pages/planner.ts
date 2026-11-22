import { checkPin, generatePlans, validityGrid, wearWarning, zoneName, zoneOf } from "../core/planner"
import type { Ctx } from "../main"
import type { DayPlan, PinPos } from "../core/types"
import { el } from "../ui/dom"
import { eventToField, fitCanvas, renderGreen } from "../ui/green2d"

// 洞位规划:合规检查 + 十八洞均衡自动排布 + 磨损提醒
export const render = (root: HTMLElement, ctx: Ctx): void => {
  const s = ctx.store.settings
  const today = new Date().toISOString().slice(0, 10)
  const state = {
    date: today,
    pins: {} as Record<string, PinPos>,
    schemes: [] as Record<string, PinPos>[],
    schemeIdx: -1,
  }
  // 初始:每个果岭取中心附近第一个合规点
  for (const g of ctx.store.greens) {
    state.pins[g.id] = { x: g.field.width / 2, y: g.field.height / 2 }
  }

  const green = () => ctx.store.greens.find((g) => g.id === ctx.greenId) ?? ctx.store.greens[0]

  root.append(
    el("h1", { class: "page-title" }, ["洞位规划"]),
    el("p", { class: "page-desc" }, ["红色区域不合规(坡度过陡或离边缘太近),点击地图放置洞杯,自动方案保证左中右、前中后均衡"]),
  )

  const dateInput = el("input", { class: "input", type: "date", value: today }) as HTMLInputElement
  dateInput.addEventListener("change", () => {
    state.date = dateInput.value
  })
  const genBtn = el("button", { class: "btn primary" }, ["自动生成 3 套方案"])
  const adoptBtn = el("button", { class: "btn" }, ["采用当前方案并记录"])
  const toolbar = el("div", { class: "toolbar" }, [el("span", { class: "muted" }, ["日期"]), dateInput, genBtn, adoptBtn])

  const schemeBox = el("div", { class: "row" })
  const balanceBox = el("div", { class: "panel" })
  const warnBox = el("div", { class: "panel", style: "display:none" })

  const canvas = el("canvas", { class: "green-view", style: "cursor:crosshair" }) as HTMLCanvasElement
  const infoLine = el("div", { class: "muted", style: "padding:8px 4px" })
  const mapPanel = el("div", { class: "canvas-wrap" }, [canvas])

  const greenTabs = el("div", { class: "row", style: "margin-bottom:12px" })

  root.append(toolbar, schemeBox, el("div", { class: "layout-2" }, [
    el("div", {}, [el("div", { class: "panel" }, [el("h2", { class: "panel-title" }, ["选择果岭"]), greenTabs]), balanceBox, warnBox]),
    el("div", {}, [mapPanel, infoLine]),
  ]))

  let mask: { n: number; values: boolean[] } | null = null

  const drawMap = () => {
    const g = green()
    fitCanvas(canvas, g)
    if (!mask) mask = { n: 24, values: validityGrid(g, s, 24) }
    const pin = state.pins[g.id]
    renderGreen(canvas, g, {
      color: true,
      contours: true,
      arrows: false,
      mask,
      pins: [{ x: pin.x, y: pin.y, label: zoneName(zoneOf(g, pin.x, pin.y)) }],
    })
    const check = checkPin(g, s, pin.x, pin.y)
    infoLine.replaceChildren(
      el("span", { class: `tag ${check.ok ? "ok" : "bad"}` }, [
        check.ok ? `合规 · 1m 内最大坡度 ${check.maxSlope.toFixed(1)}%` : `不合规:${check.reasons.join(";")}`,
      ]),
    )
  }

  const drawBalance = () => {
    const lr = [0, 0, 0]
    const fb = [0, 0, 0]
    for (const g of ctx.store.greens) {
      const p = state.pins[g.id]
      const z = zoneOf(g, p.x, p.y)
      lr[z.lr]++
      fb[z.fb]++
    }
    balanceBox.replaceChildren(
      el("h2", { class: "panel-title" }, ["均衡统计"]),
      el("div", { class: "row" }, [
        el("span", { class: "tag" }, [`左 ${lr[0]}`]),
        el("span", { class: "tag" }, [`中 ${lr[1]}`]),
        el("span", { class: "tag" }, [`右 ${lr[2]}`]),
        el("span", { class: "tag" }, [`前 ${fb[0]}`]),
        el("span", { class: "tag" }, [`中 ${fb[1]}`]),
        el("span", { class: "tag" }, [`后 ${fb[2]}`]),
      ]),
    )
    // 磨损提醒汇总
    const warns: string[] = []
    for (const g of ctx.store.greens) {
      const w = wearWarning(g.id, state.pins[g.id], ctx.store.history, s, state.date)
      if (w) warns.push(`${g.hole} 号洞:${w}`)
    }
    if (warns.length > 0) {
      warnBox.style.display = ""
      warnBox.replaceChildren(el("h2", { class: "panel-title" }, ["磨损提醒"]), ...warns.map((w) => el("div", { class: "result-line" }, [w])))
    } else {
      warnBox.style.display = "none"
    }
  }

  const drawTabs = () => {
    greenTabs.replaceChildren()
    for (const g of ctx.store.greens) {
      const b = el("button", { class: `btn${g.id === ctx.greenId ? " active" : ""}` }, [String(g.hole)])
      b.addEventListener("click", () => {
        ctx.setGreen(g.id)
        mask = null
        drawTabs()
        drawMap()
      })
      greenTabs.append(b)
    }
  }

  const drawSchemes = () => {
    schemeBox.replaceChildren()
    state.schemes.forEach((scheme, k) => {
      const b = el("button", { class: `btn${k === state.schemeIdx ? " active" : ""}` }, [`方案 ${k + 1}`])
      b.addEventListener("click", () => {
        state.schemeIdx = k
        state.pins = { ...scheme }
        drawSchemes()
        drawMap()
        drawBalance()
      })
      schemeBox.append(b)
    })
  }

  genBtn.addEventListener("click", () => {
    state.schemes = generatePlans(ctx.store.greens, s, ctx.store.history, state.date, 3)
    state.schemeIdx = 0
    state.pins = { ...state.schemes[0] }
    drawSchemes()
    drawMap()
    drawBalance()
  })

  adoptBtn.addEventListener("click", () => {
    const plan: DayPlan = {
      id: `plan-${Date.now()}`,
      date: state.date,
      name: `${state.date} 洞位`,
      pins: { ...state.pins },
      createdAt: new Date().toISOString(),
    }
    ctx.store.plans.push(plan)
    for (const g of ctx.store.greens) {
      const p = state.pins[g.id]
      ctx.store.history.push({ greenId: g.id, x: p.x, y: p.y, date: state.date })
    }
    ctx.save()
    adoptBtn.textContent = "已记录"
    setTimeout(() => (adoptBtn.textContent = "采用当前方案并记录"), 1500)
    drawBalance()
  })

  canvas.addEventListener("click", (e) => {
    const g = green()
    const p = eventToField(canvas, g, e)
    if (p.x < 0 || p.x > g.field.width || p.y < 0 || p.y > g.field.height) return
    state.pins[g.id] = p
    state.schemeIdx = -1
    drawSchemes()
    drawMap()
    drawBalance()
  })

  drawTabs()
  drawMap()
  drawBalance()
}
