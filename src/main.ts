import { loadStore, loadUi, saveStore, saveUi } from "./core/storage"
import "./styles.css"
import type { Store } from "./core/types"
import { el } from "./ui/dom"
import { render as archivePage } from "./pages/archive"
import { render as terrainPage } from "./pages/terrain"
import { render as plannerPage } from "./pages/planner"
import { render as simulatePage } from "./pages/simulate"
import { render as sheetPage } from "./pages/sheet"
import { render as settingsPage } from "./pages/settings"

export interface Ctx {
  store: Store
  save: () => void
  greenId: string
  setGreen: (id: string) => void
}

type PageFn = (root: HTMLElement, ctx: Ctx) => void | (() => void)

const ROUTES: { path: string; label: string; page: PageFn }[] = [
  { path: "archive", label: "果岭档案", page: archivePage },
  { path: "terrain", label: "地形编辑", page: terrainPage },
  { path: "planner", label: "洞位规划", page: plannerPage },
  { path: "simulate", label: "推杆模拟", page: simulatePage },
  { path: "sheet", label: "赛事果岭图", page: sheetPage },
  { path: "settings", label: "设置", page: settingsPage },
]

const store = loadStore()
const ui = loadUi()

const ctx: Ctx = {
  store,
  save: () => saveStore(store),
  greenId: ui.greenId,
  setGreen: (id: string) => {
    ctx.greenId = id
    saveUi({ greenId: id })
  },
}

const app = document.getElementById("app")
if (!app) throw new Error("missing #app")

const nav = el("nav", { class: "side" }, [
  el("div", { class: "brand" }, [el("span", { class: "brand-name" }, ["果岭管理"]), el("span", { class: "brand-sub" }, ["读线 · 洞位 · 赛事图"])]),
])
const navLinks = new Map<string, HTMLElement>()
for (const r of ROUTES) {
  const link = el("a", { class: "nav-link", href: `#/${r.path}` }, [r.label])
  navLinks.set(r.path, link)
  nav.append(link)
}
const content = el("main", { class: "content" })
app.append(nav, content)

let cleanup: void | (() => void)

const route = () => {
  const hash = location.hash.replace(/^#\//, "") || "archive"
  const found = ROUTES.find((r) => r.path === hash) ?? ROUTES[0]
  for (const [p, link] of navLinks) link.classList.toggle("active", p === found.path)
  if (typeof cleanup === "function") cleanup()
  content.replaceChildren()
  cleanup = found.page(content, ctx)
}

window.addEventListener("hashchange", route)
route()
