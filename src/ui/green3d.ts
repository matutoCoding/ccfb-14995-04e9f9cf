import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

import { heightRange } from "../core/heightfield"
import type { Green } from "../core/types"
import type { TrajPoint } from "../core/physics"

// 果岭三维视图:网格地形 + 轨迹线 + 球体动画
export class Green3D {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private mesh: THREE.Mesh | null = null
  private line: THREE.Line | null = null
  private ball: THREE.Mesh
  private green: Green | null = null
  private traj: TrajPoint[] = []
  private animT = 0
  private playing = false
  private raf = 0
  private clock = new THREE.Clock()
  private observer: ResizeObserver
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(this.renderer.domElement)
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.scene.background = new THREE.Color(0xf0f3f1)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8aa392, 1.1)
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(30, 50, 20)
    this.scene.add(hemi, sun)
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    )
    this.ball.visible = false
    this.scene.add(this.ball)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(container)
    this.resize()
    this.loop()
  }

  private resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  setGreen(green: Green) {
    this.green = green
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
    }
    const f = green.field
    const geo = new THREE.PlaneGeometry(f.width, f.height, f.cols - 1, f.rows - 1)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const { min, max } = heightRange(f)
    const span = Math.max(max - min, 0.01)
    const low = new THREE.Color(0x4d8f5f)
    const high = new THREE.Color(0xa8c68f)
    const c = new THREE.Color()
    for (let k = 0; k < pos.count; k++) {
      // PlaneGeometry 首行在 +y 侧,rotateX 后行序与场地相反,需翻转
      const i = k % f.cols
      const j = Math.floor(k / f.cols)
      const h = f.data[(f.rows - 1 - j) * f.cols + i]
      pos.setY(k, h)
      c.copy(low).lerp(high, (h - min) / span)
      colors[k * 3] = c.r
      colors[k * 3 + 1] = c.g
      colors[k * 3 + 2] = c.b
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
    this.mesh = new THREE.Mesh(geo, mat)
    this.scene.add(this.mesh)
    this.camera.position.set(0, f.height * 1.1, f.height * 1.25)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
    this.clearTrajectory()
  }

  // 场地坐标转三维坐标(场地中心为原点)
  private to3d(x: number, y: number, z: number): THREE.Vector3 {
    const f = this.green?.field
    const w = f ? f.width : 1
    const h = f ? f.height : 1
    return new THREE.Vector3(x - w / 2, z + 0.06, -(y - h / 2))
  }

  setTrajectory(points: TrajPoint[]) {
    this.clearTrajectory()
    this.traj = points
    if (!this.green || points.length < 2) return
    const verts = points.map((p) => this.to3d(p.x, p.y, p.z))
    const geo = new THREE.BufferGeometry().setFromPoints(verts)
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1d4ed8 }))
    this.scene.add(this.line)
    const last = points[points.length - 1]
    this.ball.position.copy(this.to3d(last.x, last.y, last.z))
    this.ball.visible = true
  }

  clearTrajectory() {
    if (this.line) {
      this.scene.remove(this.line)
      this.line.geometry.dispose()
      this.line = null
    }
    this.traj = []
    this.ball.visible = false
    this.playing = false
  }

  // 按轨迹时间戳播放球的滚动
  play() {
    if (this.traj.length < 2) return
    this.animT = 0
    this.playing = true
    this.ball.visible = true
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = this.clock.getDelta()
    if (this.playing && this.traj.length > 1) {
      this.animT += dt
      const total = this.traj[this.traj.length - 1].t
      if (this.animT >= total) {
        this.animT = total
        this.playing = false
      }
      // 按时间二分定位
      let lo = 0
      let hi = this.traj.length - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (this.traj[mid].t <= this.animT) lo = mid
        else hi = mid
      }
      const a = this.traj[lo]
      const b = this.traj[hi]
      const span = Math.max(b.t - a.t, 1e-6)
      const u = (this.animT - a.t) / span
      const x = a.x + (b.x - a.x) * u
      const y = a.y + (b.y - a.y) * u
      const z = a.z + (b.z - a.z) * u
      this.ball.position.copy(this.to3d(x, y, z))
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
