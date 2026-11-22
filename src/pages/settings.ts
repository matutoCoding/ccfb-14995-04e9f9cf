import { selfTest } from "../core/physics"
import type { Ctx } from "../main"
import type { Settings } from "../core/types"
import { el, labeled, numberInput } from "../ui/dom"

// 设置:物理参数 + 洞位规则 + 物理自检
export const render = (root: HTMLElement, ctx: Ctx): void => {
  const s = ctx.store.settings

  root.append(
    el("h1", { class: "page-title" }, ["设置"]),
    el("p", { class: "page-desc" }, ["修改后自动保存,立即生效"]),
  )

  const bind = (label: string, key: keyof Settings, step: number) =>
    labeled(label, numberInput(s[key], step, (v) => {
      s[key] = v
      ctx.save()
    }))

  const physicsPanel = el("div", { class: "panel" }, [
    el("h2", { class: "panel-title" }, ["草坪物理"]),
    el("div", { class: "layout-2" }, [
      el("div", {}, [
        bind("默认果岭速度(英尺)", "stimp", 0.5),
        bind("晨露减速比例", "dewSlow", 0.05),
        bind("下午干燥加速比例", "dryFast", 0.05),
      ]),
      el("div", {}, [
        bind("草纹影响强度", "grainEffect", 0.05),
        bind("进洞最大球速(m/s)", "captureSpeed", 0.1),
        bind("洞杯半径(m)", "cupRadius", 0.001),
      ]),
    ]),
  ])

  const rulePanel = el("div", { class: "panel" }, [
    el("h2", { class: "panel-title" }, ["洞位规则"]),
    el("div", { class: "layout-2" }, [
      el("div", {}, [
        bind("洞杯区最大坡度(%)", "maxPinSlope", 0.5),
        bind("坡度检查半径(m)", "pinRadius", 0.25),
        bind("距边缘最小距离(m)", "edgeMargin", 0.5),
      ]),
      el("div", {}, [
        bind("踩踏判定半径(m)", "wearRadius", 0.5),
        bind("周期内最多次数", "wearMaxUses", 1),
        bind("统计周期(天)", "wearDays", 7),
        bind("步长(m)", "paceLength", 0.05),
      ]),
    ]),
  ])

  // 物理自检:平地停球距离对得上果岭速度定义,且结果确定
  const testOut = el("div")
  const testBtn = el("button", { class: "btn primary" }, ["运行物理自检"])
  testBtn.addEventListener("click", () => {
    const rows: HTMLElement[] = []
    for (const stimp of [8, 10, 12]) {
      const r = selfTest(stimp)
      const err = Math.abs(r.got - r.expected) / r.expected
      const ok = err < 0.01 && r.deterministic
      rows.push(
        el("div", { class: "result-line" }, [
          `果岭速度 ${stimp} 英尺:期望停球 ${r.expected.toFixed(3)} m,模拟 ${r.got.toFixed(3)} m,` +
            `误差 ${(err * 100).toFixed(2)}% · 两次模拟逐位一致:${r.deterministic ? "是" : "否"} `,
          el("span", { class: `tag ${ok ? "ok" : "bad"}` }, [ok ? "通过" : "未通过"]),
        ]),
      )
    }
    testOut.replaceChildren(...rows)
  })
  const testPanel = el("div", { class: "panel" }, [
    el("h2", { class: "panel-title" }, ["物理自检"]),
    el("p", { class: "muted" }, ["在平地上以测速仪出球速度(1.83 m/s)推球,停球距离应等于果岭速度定义值;同一输入跑两次,轨迹必须逐位一致。"]),
    el("div", { class: "row" }, [testBtn]),
    testOut,
  ])

  root.append(physicsPanel, rulePanel, testPanel)
}
