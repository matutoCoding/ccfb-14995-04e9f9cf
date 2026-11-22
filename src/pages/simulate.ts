import { simulate } from "../core/physics"
import type { PuttEnv, SimResult } from "../core/physics"
import { findAimOptions, threePuttRisk } from "../core/readline"
import type { Ctx } from "../main"
import type { Vec2 } from "../core/types"
import { el, labeled, select } from "../ui/dom"
import { eventToField, fitCanvas, renderGreen } from "../ui/green2d"
import type { PathMark, PinMark } from "../ui/green2d"
import { Green3D } from "../ui/green3d"

type Mode = "putt" | "read" | "risk"

const OUTCOME_TEXT: Record<string, string> = {
  holed: "进洞",
  lipped: "擦洞而过",
  stopped: "停住",
  off: "滚出果岭",
  timeout: "超时未停",
}

const PATH_COLORS = ["#1d4ed8", "#c2410c", "#7c3aed"]

// 推杆模拟:手动推杆 / 读线辅助 / 三推风险
export const render = (root: HTMLElement, ctx: Ctx): (() => void) => {
  const s = ctx.store.settings
  const state = {
    mode: "putt" as Mode,
    timeOfDay: "noon" as "morning" | "noon" | "afternoon",
    grainOn: true,
    stimp: 0, // 0 表示跟随果岭设定
    start: null as Vec2 | null,
    aim: null as Vec2 | null,
    hole: null as Vec2 | null,
    speed: 3.0,
    paths: [] as PathMark[],
    marks: [] as PinMark[],
    risk: null as { n: number; values: number[] } | null,
    show3d: false,
    lastSim: null as SimResult | null,
  }
  let view3d: Green3D | null = null

  const green = () => ctx.store.greens.find((g) => g.id === ctx.greenId) ?? ctx.store.greens[0]

  // 当前环境:时段影响湿度,草纹可开关
  const env = (): PuttEnv => {
    const g = green()
    const base = state.stimp > 0 ? state.stimp : g.stimp
    const stimp = state.timeOfDay === "morning" ? base * (1 - s.dewSlow) : state.timeOfDay === "afternoon" ? base * (1 + s.dryFast) : base
    return { stimp, grainOn: state.grainOn, grainDir: g.grainDir, grainStrength: g.grainStrength, grainEffect: s.grainEffect }
  }

  root.append(
    el("h1", { class: "page-title" }, ["推杆模拟"]),
    el("p", { class: "page-desc" }, ["同一输入必然得到同一轨迹。平地停球距离严格对应果岭速度定义,可在「设置」页运行物理自检"]),
  )

  const hint = el("div", { class: "muted", style: "padding:8px 4px" })
  const resultBox = el("div", { class: "panel", style: "margin-top:12px;display:none" })
  const canvas = el("canvas", { class: "green-view", style: "cursor:crosshair" }) as HTMLCanvasElement
  const view3dBox = el("div", { class: "view3d", style: "display:none" })

  const modeBtns: Record<Mode, HTMLElement> = {
    putt: el("button", { class: "btn active" }, ["手动推杆"]),
    read: el("button", { class: "btn" }, ["读线辅助"]),
    risk: el("button", { class: "btn" }, ["三推风险"]),
  }

  const speedInput = el("input", { class: "input", type: "range", min: "0.5", max: "6", step: "0.1", value: "3.0" }) as HTMLInputElement
  const speedLabel = el("span", { class: "muted" }, ["3.0 m/s"])
  speedInput.addEventListener("input", () => {
    state.speed = parseFloat(speedInput.value)
    speedLabel.textContent = `${state.speed.toFixed(1)} m/s`
  })

  const stimpInput = el("input", { class: "input", type: "number", step: "0.5", min: "6", max: "14", placeholder: "跟随果岭" }) as HTMLInputElement
  stimpInput.addEventListener("change", () => {
    state.stimp = parseFloat(stimpInput.value) || 0
  })

  const puttBtn = el("button", { class: "btn primary" }, ["推杆"])
  const clearBtn = el("button", { class: "btn" }, ["清除"])
  const play3dBtn = el("button", { class: "btn" }, ["3D 回放"])

  const side = el("div", { class: "panel" }, [
    el("h2", { class: "panel-title" }, ["条件设置"]),
    labeled("果岭", select(
      ctx.store.greens.map((g) => ({ value: g.id, label: `${g.hole} 号洞 · ${g.name}` })),
      ctx.greenId,
      (id) => {
        ctx.setGreen(id)
        reset()
        redraw()
      },
    )),
    labeled("时段", select(
      [
        { value: "morning", label: "早晨(露水慢)" },
        { value: "noon", label: "中午(标准)" },
        { value: "afternoon", label: "下午(干燥快)" },
      ] as { value: "morning" | "noon" | "afternoon"; label: string }[],
      "noon",
      (v) => {
        state.timeOfDay = v
      },
    )),
    labeled("果岭速度覆盖(英尺)", stimpInput),
    labeled("草纹影响", select(
      [
        { value: "on", label: "开启" },
        { value: "off", label: "关闭" },
      ] as { value: "on" | "off"; label: string }[],
      "on",
      (v) => {
        state.grainOn = v === "on"
      },
    )),
    el("h2", { class: "panel-title", style: "margin-top:16px" }, ["模式"]),
    el("div", { class: "row", style: "margin-bottom:12px" }, Object.values(modeBtns)),
    labeled("出手速度", el("div", { class: "row" }, [speedInput, speedLabel])),
    el("div", { class: "row" }, [puttBtn, clearBtn, play3dBtn]),
  ])

  root.append(el("div", { class: "layout-2" }, [
    side,
    el("div", {}, [el("div", { class: "canvas-wrap" }, [canvas]), hint, view3dBox, resultBox]),
  ]))

  const setMode = (m: Mode) => {
    state.mode = m
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle("active", k === m)
    reset()
    redraw()
  }
  ;(Object.keys(modeBtns) as Mode[]).forEach((m) => modeBtns[m].addEventListener("click", () => setMode(m)))

  const reset = () => {
    state.start = null
    state.aim = null
    state.hole = null
    state.paths = []
    state.marks = []
    state.risk = null
    state.lastSim = null
    resultBox.style.display = "none"
    if (view3d) view3d.clearTrajectory()
  }

  const updateHint = () => {
    const g = green()
    const e = env()
    const base = `当前果岭速度 ${e.stimp.toFixed(1)} 英尺 · 草纹${state.grainOn ? "开" : "关"}`
    if (state.mode === "putt") {
      hint.textContent = state.start ? `${base} · 点击果岭选择瞄准方向` : `${base} · 点击果岭选择球的起点`
    } else if (state.mode === "read") {
      hint.textContent = state.hole ? `${base} · 点击选择球的起点,自动反推瞄准点` : `${base} · 点击放置洞杯`
    } else {
      hint.textContent = `${base} · 点击放置洞杯,计算三推风险分布`
    }
    void g
  }

  const redraw = () => {
    const g = green()
    fitCanvas(canvas, g)
    const pins: PinMark[] = [...state.marks]
    if (state.start) pins.push({ x: state.start.x, y: state.start.y, label: "球", color: "#1d4ed8" })
    if (state.aim) pins.push({ x: state.aim.x, y: state.aim.y, label: "瞄准", color: "#c2410c" })
    if (state.hole) pins.push({ x: state.hole.x, y: state.hole.y, label: "洞杯", color: "#b91c1c" })
    renderGreen(canvas, g, {
      color: true,
      contours: true,
      arrows: true,
      pins,
      paths: state.paths,
      risk: state.risk ?? undefined,
    })
    updateHint()
  }

  const showResult = (sim: SimResult) => {
    state.lastSim = sim
    resultBox.style.display = ""
    resultBox.replaceChildren(
      el("h2", { class: "panel-title" }, ["结果"]),
      el("div", { class: "result-line" }, [`结果:${OUTCOME_TEXT[sim.outcome]}`]),
      el("div", { class: "result-line" }, [`滚动距离:${sim.distance.toFixed(2)} m · 用时 ${sim.time.toFixed(1)} s`]),
      el("div", { class: "result-line" }, [`停点:(${sim.endX.toFixed(2)}, ${sim.endY.toFixed(2)})`]),
    )
  }

  const doPutt = () => {
    if (!state.start || !state.aim) return
    const g = green()
    const hole = state.hole ? { x: state.hole.x, y: state.hole.y, r: s.cupRadius, capture: s.captureSpeed } : undefined
    const sim = simulate(g.field, env(), state.start, { x: state.aim.x - state.start.x, y: state.aim.y - state.start.y }, state.speed, hole)
    state.paths = [{ pts: sim.points, color: PATH_COLORS[0] }]
    showResult(sim)
    redraw()
    sync3d()
  }

  const doRead = () => {
    if (!state.start || !state.hole) return
    const g = green()
    const options = findAimOptions(g.field, env(), state.start, state.hole, s.cupRadius, s.captureSpeed)
    state.paths = options.map((o, k) => ({ pts: o.sim.points, color: PATH_COLORS[k % PATH_COLORS.length] }))
    state.marks = options.map((o, k) => ({ x: o.aim.x, y: o.aim.y, label: `瞄准${k + 1}`, color: PATH_COLORS[k % PATH_COLORS.length] }))
    resultBox.style.display = ""
    if (options.length === 0) {
      resultBox.replaceChildren(el("div", { class: "result-line" }, ["该起点在当前速度下无法进洞,坡度可能太陡"]))
    } else {
      resultBox.replaceChildren(
        el("h2", { class: "panel-title" }, ["读线方案(速度越大弯越小)"]),
        ...options.map((o, k) => {
          const d = Math.hypot(o.aim.x - (state.hole?.x ?? 0), o.aim.y - (state.hole?.y ?? 0))
          return el("div", { class: "result-line" }, [
            `方案 ${k + 1}:出手 ${o.speed.toFixed(1)} m/s,瞄准点偏 ${d.toFixed(2)} m`,
          ])
        }),
      )
    }
    redraw()
  }

  const doRisk = () => {
    if (!state.hole) return
    const g = green()
    state.risk = threePuttRisk(g.field, env(), state.hole, s.cupRadius, s.captureSpeed)
    resultBox.style.display = ""
    resultBox.replaceChildren(el("div", { class: "result-line" }, ["红色越深,从该位置首推后留下长距离二推的概率越高"]))
    redraw()
  }

  const sync3d = () => {
    if (!state.show3d) return
    if (!view3d) {
      view3dBox.style.display = ""
      view3d = new Green3D(view3dBox)
      view3d.setGreen(green())
    }
    if (state.lastSim) {
      view3d.setTrajectory(state.lastSim.points)
      view3d.play()
    }
  }

  puttBtn.addEventListener("click", doPutt)
  clearBtn.addEventListener("click", () => {
    reset()
    redraw()
  })
  play3dBtn.addEventListener("click", () => {
    state.show3d = !state.show3d
    if (!state.show3d && view3d) {
      view3d.dispose()
      view3d = null
      view3dBox.style.display = "none"
    } else {
      sync3d()
    }
  })

  canvas.addEventListener("click", (e) => {
    const g = green()
    const p = eventToField(canvas, g, e)
    if (p.x < 0 || p.x > g.field.width || p.y < 0 || p.y > g.field.height) return
    if (state.mode === "putt") {
      if (!state.start) state.start = p
      else {
        state.aim = p
        doPutt()
        return
      }
    } else if (state.mode === "read") {
      if (!state.hole) state.hole = p
      else {
        state.start = p
        doRead()
        return
      }
    } else {
      state.hole = p
      doRisk()
      return
    }
    redraw()
  })

  requestAnimationFrame(redraw)

  return () => {
    if (view3d) view3d.dispose()
  }
}
