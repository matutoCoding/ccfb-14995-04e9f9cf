// 全局数据类型
export interface Vec2 {
  x: number
  y: number
}

// 高度场:规则网格,原点为果岭左下角(前缘左侧),单位米
export interface HeightFieldData {
  cols: number
  rows: number
  width: number
  height: number
  data: number[]
}

export interface Green {
  id: string
  hole: number
  name: string
  field: HeightFieldData
  grainDir: number // 草纹朝向(草倒伏方向),弧度,0 为 +x
  grainStrength: number // 0..1 纹路轻重
  stimp: number // 果岭速度,英尺
  note: string
  updatedAt: string
}

export interface PinPos {
  x: number
  y: number
}

// 一天的十八洞洞位方案
export interface DayPlan {
  id: string
  date: string
  name: string
  pins: Record<string, PinPos>
  createdAt: string
}

export interface HistoryEntry {
  greenId: string
  x: number
  y: number
  date: string
}

export interface Settings {
  stimp: number // 默认果岭速度(英尺)
  dewSlow: number // 晨露减速比例
  dryFast: number // 下午变干加快比例
  grainEffect: number // 草纹对摩擦的影响强度
  captureSpeed: number // 进洞最大球速 m/s
  cupRadius: number // 洞杯半径 m
  maxPinSlope: number // 洞杯区允许最大坡度 %
  pinRadius: number // 洞杯坡度检查半径 m
  edgeMargin: number // 洞杯距果岭边缘最小距离 m
  wearRadius: number // 踩踏判定半径 m
  wearMaxUses: number // 周期内同一位置最多使用次数
  wearDays: number // 踩踏统计周期(天)
  paceLength: number // 步长 m
}

export interface Store {
  greens: Green[]
  plans: DayPlan[]
  history: HistoryEntry[]
  settings: Settings
}

export const defaultSettings = (): Settings => ({
  stimp: 10,
  dewSlow: 0.15,
  dryFast: 0.1,
  grainEffect: 0.25,
  captureSpeed: 1.0,
  cupRadius: 0.054,
  maxPinSlope: 3.0,
  pinRadius: 1.0,
  edgeMargin: 3.5,
  wearRadius: 2.0,
  wearMaxUses: 4,
  wearDays: 30,
  paceLength: 0.8,
})
