import type { EChartsOption } from 'echarts'
import type { AttritionPoint } from '../domain/battle'
import type { MonteCarloResult } from '../domain/aggregate'
import type { SeasonResult, SeasonSnapshot } from '../domain/season'
import type { SensitivityResult } from '../domain/sensitivity'
import { seasonChartTooltip } from './tooltip'

export interface DashboardSeries {
  name: string
  type: 'line' | 'bar'
  data: unknown[]
  stack?: string
  symbol?: string
  smooth?: boolean
  showSymbol?: boolean
  lineStyle?: Record<string, unknown>
  areaStyle?: Record<string, unknown>
  itemStyle?: Record<string, unknown>
  emphasis?: Record<string, unknown>
  yAxisIndex?: number
}

export type DashboardChartOption = Omit<EChartsOption, 'series'> & {
  series: DashboardSeries[]
}

const GUILD_COLORS = ['#57a8ff', '#f3c665', '#ef7aa8', '#7dd7c4']

function baseOption(): Omit<DashboardChartOption, 'series'> {
  return {
    animationDuration: 240,
    color: GUILD_COLORS,
    grid: { left: 56, right: 24, top: 42, bottom: 42, containLabel: true },
    legend: { top: 4, textStyle: { color: '#aebbd3' } },
    tooltip: { trigger: 'axis', confine: false },
    xAxis: { type: 'value', axisLabel: { color: '#8493ad' }, splitLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: '#8493ad' }, splitLine: { lineStyle: { color: '#243450' } } },
  }
}

export function buildScoreOption(
  result: MonteCarloResult | SeasonResult,
): DashboardChartOption {
  if ('runsCompleted' in result) {
    const series: DashboardSeries[] = []
    Object.entries(result.guilds).forEach(([guildId, guild], index) => {
      const stack = `${guildId}-interval`
      series.push({
        name: `${guildId} P10 基线`,
        type: 'line',
        data: guild.scoreSeries.map((point) => [point.minute, point.p10]),
        stack,
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        emphasis: { disabled: true },
      })
      series.push({
        name: `${guildId} P10–P90`,
        type: 'line',
        data: guild.scoreSeries.map((point) => [point.minute, point.p90 - point.p10]),
        stack,
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0.16, color: GUILD_COLORS[index % GUILD_COLORS.length] },
      })
      series.push({
        name: `${guildId} 中位数`,
        type: 'line',
        data: guild.scoreSeries.map((point) => [point.minute, point.median]),
        symbol: 'none',
        lineStyle: { width: 2, color: GUILD_COLORS[index % GUILD_COLORS.length] },
      })
    })
    return { ...baseOption(), series }
  }

  const byGuild = new Map<string, SeasonSnapshot[]>()
  for (const snapshot of result.snapshots) {
    const list = byGuild.get(snapshot.guildId) ?? []
    list.push(snapshot)
    byGuild.set(snapshot.guildId, list)
  }
  const series: DashboardSeries[] = [...byGuild.entries()].map(([guildId, snapshots]) => ({
    name: guildId,
    type: 'line',
    symbol: 'none',
    data: snapshots.map((snapshot, index) => ({
      value: [snapshot.minute, snapshot.totalScore],
      meta: { snapshot, previous: snapshots[index - 1] },
    })),
  }))
  return {
    ...baseOption(),
    tooltip: { trigger: 'axis', confine: false, formatter: seasonChartTooltip },
    series,
  }
}

export function buildBattleOption(
  equalFans: AttritionPoint[],
  doubleFans: AttritionPoint[],
): DashboardChartOption {
  return {
    ...baseOption(),
    xAxis: { type: 'value', name: '场次', minInterval: 1 },
    yAxis: [
      { type: 'value', name: '百分比', min: 0, max: 1, axisLabel: { formatter: '{value}' } },
      { type: 'value', name: '守方粉丝', min: 0 },
    ],
    series: [
      { name: '1,000 显示倾向', type: 'line', data: equalFans.map((point) => [point.battle, point.displayedTendency]) },
      { name: '1,000 真实胜率', type: 'line', data: equalFans.map((point) => [point.battle, point.actualWinProbability]) },
      { name: '2,000 显示倾向', type: 'line', data: doubleFans.map((point) => [point.battle, point.displayedTendency]) },
      { name: '2,000 真实胜率', type: 'line', data: doubleFans.map((point) => [point.battle, point.actualWinProbability]) },
      { name: '1,000 守方粉丝', type: 'line', yAxisIndex: 1, data: equalFans.map((point) => [point.battle, point.defenderFans]) },
      { name: '2,000 守方粉丝', type: 'line', yAxisIndex: 1, data: doubleFans.map((point) => [point.battle, point.defenderFans]) },
    ],
  }
}

function endOfDaySnapshots(result: SeasonResult, guildId: string): SeasonSnapshot[] {
  return result.snapshots.filter((snapshot) => (
    snapshot.guildId === guildId
    && snapshot.minute > 0
    && snapshot.minute % 1440 === 0
  ))
}

export function buildDailyBreakdownOption(result: SeasonResult): DashboardChartOption {
  const guildIds = Object.keys(result.guilds)
  const series: DashboardSeries[] = []
  for (const guildId of guildIds) {
    const days = endOfDaySnapshots(result, guildId)
    series.push({
      name: `${guildId} 战斗`,
      type: 'bar',
      stack: guildId,
      data: days.map((snapshot, index) => [
        index + 1,
        snapshot.attackScore - (days[index - 1]?.attackScore ?? 0),
      ]),
    })
    series.push({
      name: `${guildId} 占领`,
      type: 'bar',
      stack: guildId,
      data: days.map((snapshot, index) => [
        index + 1,
        snapshot.holdingScore - (days[index - 1]?.holdingScore ?? 0),
      ]),
    })
  }
  return { ...baseOption(), xAxis: { type: 'value', name: '战斗日', minInterval: 1 }, series }
}

export function buildNodeFanOption(
  result: SeasonResult,
  guildId: string,
): DashboardChartOption {
  const snapshots = result.snapshots.filter((snapshot) => snapshot.guildId === guildId)
  return {
    ...baseOption(),
    series: [
      { name: '节点数', type: 'line', data: snapshots.map((point) => [point.minute, point.normalNodes + point.coreNodes + point.centerNodes]) },
      { name: '可用粉丝', type: 'line', data: snapshots.map((point) => [point.minute, point.availableFans]) },
      { name: '驻守粉丝', type: 'line', data: snapshots.map((point) => [point.minute, point.garrisonFans]) },
      { name: '累计损失粉丝', type: 'line', data: snapshots.map((point) => [point.minute, point.lostFans]) },
    ],
  }
}

export function buildSensitivityOption(
  result: SensitivityResult | null,
): DashboardChartOption {
  return {
    ...baseOption(),
    xAxis: { type: 'value', name: result?.request.parameter ?? '参数' },
    series: [{
      name: result?.request.metric ?? '指标',
      type: 'line',
      data: result?.points.map((point) => [point.x, point.metricValue]) ?? [],
    }],
  }
}
