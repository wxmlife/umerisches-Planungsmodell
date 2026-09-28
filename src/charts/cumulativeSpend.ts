import type { SpendEvent } from '../domain/economy'
import type { CumulativeSpendSeries, SpendPoint } from './options'

export type SpendDimension = 'guild' | 'tier' | 'offer'

function groupFor(event: SpendEvent, dimension: SpendDimension): string {
  if (dimension === 'guild') return event.guildId
  if (dimension === 'tier') return event.tier
  return event.offerId
}

function timelineFor(events: SpendEvent[]): number[] {
  const maxMinute = Math.max(0, ...events.map((event) => event.minute))
  const values = new Set<number>([0, ...events.map((event) => event.minute)])
  const lastBoundary = Math.ceil(maxMinute / 1440) * 1440
  for (let minute = 1440; minute <= lastBoundary; minute += 1440) values.add(minute)
  return [...values].sort((a, b) => a - b)
}

function pointsAt(events: SpendEvent[], timeline: number[]): SpendPoint[] {
  return timeline.map((minute) => events.reduce<SpendPoint>(
    (point, event) => {
      if (event.minute <= minute) {
        point.cashUsd += event.usd
        point.diamonds += event.diamonds
        point.ads += event.ads
      }
      return point
    },
    { minute, cashUsd: 0, diamonds: 0, ads: 0 },
  ))
}

export function buildCumulativeSpendSeries(
  events: SpendEvent[],
  dimension: SpendDimension,
): CumulativeSpendSeries {
  const timeline = timelineFor(events)
  const groups = new Map<string, SpendEvent[]>()
  for (const event of events) {
    const key = groupFor(event, dimension)
    const groupEvents = groups.get(key) ?? []
    groupEvents.push(event)
    groups.set(key, groupEvents)
  }
  return {
    totals: pointsAt(events, timeline),
    byGroup: Object.fromEntries(
      [...groups.entries()].map(([group, groupEvents]) => [
        group,
        pointsAt(groupEvents, timeline),
      ]),
    ),
  }
}
