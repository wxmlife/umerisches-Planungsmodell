import { useMemo, useState } from 'react'
import {
  buildCumulativeSpendOption,
  type CumulativeSpendSeries,
  type SpendPoint,
} from '../charts/options'
import type { SpendEvent } from '../domain/economy'
import { EChart } from './EChart'

export type SpendDimension = 'guild' | 'tier' | 'offer'
export type { CumulativeSpendSeries, SpendPoint }

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

export function CumulativeSpendPanel({
  events,
  diamondUsdRate,
}: {
  events: SpendEvent[]
  diamondUsdRate: number | null
}) {
  const [dimension, setDimension] = useState<SpendDimension>('guild')
  const series = useMemo(
    () => buildCumulativeSpendSeries(events, dimension),
    [dimension, events],
  )
  const option = useMemo(() => buildCumulativeSpendOption(series), [series])
  const totals = series.totals.at(-1) ?? { minute: 0, cashUsd: 0, diamonds: 0, ads: 0 }
  const unified = diamondUsdRate === null
    ? null
    : totals.cashUsd + totals.diamonds * diamondUsdRate

  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="cumulative-spend-title">
      <header className="card-header">
        <div><p className="eyebrow">CUMULATIVE CONSUMPTION</p><h2 id="cumulative-spend-title">累计消费仪表盘</h2></div>
        <label>分拆维度<select value={dimension} onChange={(event) => setDimension(event.target.value as SpendDimension)}><option value="guild">公会</option><option value="tier">玩家档位</option><option value="offer">商品</option></select></label>
      </header>
      <div className="metric-grid">
        <article className="metric-card"><span>现金累计</span><strong>${totals.cashUsd.toFixed(2)}</strong></article>
        <article className="metric-card"><span>钻石累计</span><strong>{totals.diamonds.toLocaleString('zh-CN')} 钻</strong></article>
        <article className="metric-card"><span>广告累计</span><strong>{totals.ads.toLocaleString('zh-CN')} 次广告</strong></article>
        {unified === null ? null : (
          <article className="metric-card metric-card--accent"><span>统一总价值</span><strong>${unified.toFixed(2)}</strong></article>
        )}
      </div>
      <EChart option={option} label="按时间累计的现金、钻石和广告消费" />
    </section>
  )
}
