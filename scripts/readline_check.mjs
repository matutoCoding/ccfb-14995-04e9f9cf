// 读线模块独立校验:反推的瞄准点必须真的能把球送进球洞
// 用法:node scripts/readline_check.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { execFileSync } from "node:child_process"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const files = ["src/core/types.ts", "src/core/heightfield.ts", "src/core/physics.ts", "src/core/readline.ts"]

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
let failures = 0
const check = (name, cond, detail) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? "  " + detail : ""))
  if (!cond) failures++
}

// 横向斜坡:3% 沿 +x,球从洞下方 6m 推,球会向 -x 弯
const f = makeField(61, 61, 30, 30)
for (let j = 0; j < 61; j++) for (let i = 0; i < 61; i++) f.data[j * 61 + i] = 0.03 * i * 0.5
const env = { stimp: 10, grainOn: false, grainDir: 0, grainStrength: 0, grainEffect: 0 }
const holePos = { x: 15, y: 19.5 }
const from = { x: 15, y: 15 }
const options = findAimOptions(f, env, from, holePos, 0.054, 1.0)
check("read options found", options.length >= 1, "got " + options.length)
options.forEach((o, k) => {
  check("option " + (k + 1) + " holes out", o.sim.outcome === "holed", "speed " + o.speed.toFixed(2) + " aim (" + o.aim.x.toFixed(2) + "," + o.aim.y.toFixed(2) + ")")
})
// 弯线方向:瞄准点应向 +x(上坡侧)偏
if (options.length > 0) check("aim uphill side", options[0].aim.x > holePos.x, "aim x " + options[0].aim.x.toFixed(2) + " vs hole " + holePos.x)
// 速度越大瞄准偏移越小
if (options.length >= 2) {
  const off0 = Math.abs(options[0].aim.x - holePos.x)
  const off1 = Math.abs(options[options.length - 1].aim.x - holePos.x)
  check("faster = less break", off1 < off0, "die " + off0.toFixed(2) + " firm " + off1.toFixed(2))
}

// 三推风险图:数值在 [0,1],大斜坡脚下风险应高于洞口附近
const risk = threePuttRisk(f, env, holePos, 0.054, 1.0, 10)
let inRange = true
for (const v of risk.values) if (v < 0 || v > 1) inRange = false
check("risk values in [0,1]", inRange)

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURES")
process.exit(failures === 0 ? 0 : 1)
`

const out = join(root, "scripts", ".readline_check.combined.ts")
writeFileSync(out, combined)
execFileSync(process.execPath, [out], { stdio: "inherit" })
