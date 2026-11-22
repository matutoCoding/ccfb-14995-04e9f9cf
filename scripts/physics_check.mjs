// 物理核心独立校验:把核心源码拼接后交给 node 的类型剥离直接运行
// 用法:node scripts/physics_check.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { execFileSync } from "node:child_process"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const files = ["src/core/types.ts", "src/core/heightfield.ts", "src/core/physics.ts"]

let combined = ""
for (const f of files) {
  const src = readFileSync(join(root, f), "utf8")
  combined += src
    .split("\n")
    .filter((line) => !line.startsWith("import "))
    .map((line) => line.replace(/^export /, ""))
    .join("\n")
}

combined += `
// ===== 校验用例 =====
let failures = 0
const check = (name, cond, detail) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? "  " + detail : ""))
  if (!cond) failures++
}

// 1. 平地停球距离 == 果岭速度定义
for (const stimp of [8, 10, 12]) {
  const r = selfTest(stimp)
  const err = Math.abs(r.got - r.expected) / r.expected
  check("stimp " + stimp + " rollout", err < 0.01, "expected " + r.expected.toFixed(3) + " got " + r.got.toFixed(3) + " err " + (err * 100).toFixed(3) + "%")
  check("stimp " + stimp + " deterministic", r.deterministic)
}

// 2. 坡道:下坡滚得比上坡远
const tilted = makeField(41, 41, 40, 40)
for (let j = 0; j < 41; j++) for (let i = 0; i < 41; i++) tilted.data[j * 41 + i] = 0.03 * i * 1 // 3% 沿 +x 上坡
const env = { stimp: 10, grainOn: false, grainDir: 0, grainStrength: 0, grainEffect: 0 }
const down = simulate(tilted, env, { x: 20, y: 20 }, { x: -1, y: 0 }, 2.0)
const up = simulate(tilted, env, { x: 20, y: 20 }, { x: 1, y: 0 }, 2.0)
check("downhill farther", down.distance > up.distance, "down " + down.distance.toFixed(2) + " up " + up.distance.toFixed(2))

// 3. 进洞判定:平地 5m,合理速度瞄准洞杯应进洞
const flat = makeField(21, 21, 20, 20)
const hole = { x: 6, y: 10, r: 0.054, capture: 1.0 }
const mu10 = muFromStimp(10)
const v = Math.sqrt(2 * mu10 * 9.81 * 5 + 0.3 * 0.3) // 到洞时余速约 0.3 m/s
const holed = simulate(flat, env, { x: 1, y: 10 }, { x: 1, y: 0 }, v, hole)
check("putt holed", holed.outcome === "holed", "outcome " + holed.outcome + " closest " + holed.closest.toFixed(3))

// 4. 超速擦洞:过大速度过洞不进
const fast = simulate(flat, env, { x: 1, y: 10 }, { x: 1, y: 0 }, 6, hole)
check("too fast lips out", fast.outcome === "lipped" || fast.outcome === "off" || fast.outcome === "stopped", "outcome " + fast.outcome)

// 5. 轨迹完全一致(逐点)
const a = simulate(tilted, env, { x: 10, y: 10 }, { x: 1, y: 1 }, 3.5)
const b = simulate(tilted, env, { x: 10, y: 10 }, { x: 1, y: 1 }, 3.5)
check("trajectory identical", JSON.stringify(a.points) === JSON.stringify(b.points))

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURES")
process.exit(failures === 0 ? 0 : 1)
`

const out = join(root, "scripts", ".physics_check.combined.ts")
writeFileSync(out, combined)
execFileSync(process.execPath, [out], { stdio: "inherit" })
