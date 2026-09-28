import type { SpendEvent } from '../domain/economy'
import type { CumulativeSpendSeries, SpendPoint } from './options'

export type SpendDimension = 'guild' | 'tier' | 'offer'
export type SpendMetric = 'usd' | 'diamond' | 'ad'

export interface SpendGroup {
  id: string
  label: string
}

export interface CumulativeSpendViewInput {
  events: SpendEvent[]
  groupCatalog: SpendGroup[]
  endMinute: number
  metric: SpendMetric
  dimension: SpendDimension
  colorResolver: (groupId: string) => string
}

function groupFor(event: SpendEvent, dimension: SpendDimension): string {
  if (dimension === 'guild') return event.guildId
  if (dimension === 'tier') return event.tier
  return event.offerId
}

function timelineFor(events: SpendEvent[], endMinute: number): number[] {
  const values = new Set<number>([0, endMinute, ...events.map((event) => event.minute)])
  for (let minute = 1440; minute < endMinute; minute += 1440) values.add(minute)
  return [...values].sort((a, b) => a - b)
}

function pointsAt(events: SpendEvent[], timeline: number[]): SpendPoint[] {
  const ordered = events.toSorted((a, b) => a.minute - b.minute)
  let cursor = 0
  const total = { cashUsd: 0, diamonds: 0, ads: 0 }
  return timeline.map(minute => {
    while (cursor < ordered.length && ordered[cursor].minute <= minute) {
      const event = ordered[cursor++]
      total.cashUsd += event.usd
      total.diamonds += event.diamonds
      total.ads += event.ads
    }
    return { minute, ...total }
  })
}

export function buildCumulativeSpendSeries(
  input: CumulativeSpendViewInput,
): CumulativeSpendSeries {
  const { events, dimension, groupCatalog, endMinute, metric, colorResolver } = input
  if (!Number.isFinite(endMinute) || endMinute < 0) throw new Error('赛季结束时间无效')
  const timeline = timelineFor(events, endMinute)
  const groups = new Map<string, SpendEvent[]>(groupCatalog.map(group => [group.id, []]))
  if (groups.size !== groupCatalog.length) throw new Error('分组目录包含重复 ID')
  for (const event of events) {
    const key = groupFor(event, dimension)
    if (typeof key !== 'string' || !key) throw new Error('消费事件缺少分组键')
    if (!Number.isFinite(event.minute) || event.minute < 0 || event.minute > endMinute) throw new Error('消费事件时间超出赛季范围')
    const groupEvents = groups.get(key)
    if (!groupEvents) throw new Error('消费事件分组不在目录中')
    groupEvents.push(event)
  }
  return {
    metric,
    endMinute,
    groups: groupCatalog.map(group => ({ ...group, color: colorResolver(group.id) })),
    totals: pointsAt(events, timeline),
    byGroup: Object.fromEntries(
      [...groups.entries()].map(([group, groupEvents]) => [
        group,
        pointsAt(groupEvents, timeline),
      ]),
    ),
  }
}
