// 极简 DOM 构建工具
type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>

export const el = (tag: string, attrs: Attrs = {}, children: (Node | string)[] = []): HTMLElement => {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = String(v)
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    } else if (typeof v === "boolean") {
      if (v) node.setAttribute(k, "")
    } else node.setAttribute(k, String(v))
  }
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c)
  }
  return node
}

export const labeled = (label: string, control: HTMLElement): HTMLElement =>
  el("label", { class: "field" }, [el("span", { class: "field-label" }, [label]), control])

export const numberInput = (value: number, step: number, onChange: (v: number) => void): HTMLElement => {
  const input = el("input", { class: "input", type: "number", step: String(step), value: String(value) }) as HTMLInputElement
  input.addEventListener("change", () => {
    const v = parseFloat(input.value)
    if (Number.isFinite(v)) onChange(v)
  })
  return input
}

export const select = <T extends string>(
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLElement => {
  const node = el("select", { class: "input" }) as HTMLSelectElement
  for (const o of options) {
    const opt = el("option", { value: o.value }, [o.label])
    if (o.value === value) opt.setAttribute("selected", "")
    node.append(opt)
  }
  node.addEventListener("change", () => onChange(node.value as T))
  return node
}
