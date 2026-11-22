import { buildSeedGreens } from "./seed_greens"
import { defaultSettings } from "./types"
import type { Store } from "./types"

const KEY = "greenkeeper.v1"
const UI_KEY = "greenkeeper.ui"

// localStorage 属于外部数据,解析失败时回退到种子数据
export const loadStore = (): Store => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Store
      if (parsed.greens && parsed.settings) return parsed
    }
  } catch {
    // 数据损坏则重建
  }
  const store: Store = {
    greens: buildSeedGreens(),
    plans: [],
    history: [],
    settings: defaultSettings(),
  }
  saveStore(store)
  return store
}

export const saveStore = (store: Store): void => {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export const loadUi = (): { greenId: string } => {
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // 忽略
  }
  return { greenId: "green-1" }
}

export const saveUi = (ui: { greenId: string }): void => {
  localStorage.setItem(UI_KEY, JSON.stringify(ui))
}
