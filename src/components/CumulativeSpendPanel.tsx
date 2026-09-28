import { useMemo, useState } from 'react'
import {
  buildCumulativeSpendOption,
  formatSpendValue,
} from '../charts/options'
import {
  buildCumulativeSpendSeries,
  type SpendDimension,
  type SpendMetric,
} from '../charts/cumulativeSpend'
import type { SpendEvent } from '../domain/economy'
import type { Scenario } from '../domain/types'
import { resolveGuildColors, resolveSemanticColor } from '../charts/colors'
import { EChart } from './EChart'

export function CumulativeSpendPanel({
  events,
  scenario,
}: {
  events: SpendEvent[]
  scenario: Scenario
}) {
  const [dimension, setDimension] = useState<SpendDimension>('guild')
  const [metric, setMetric] = useState<SpendMetric>('usd')
  const { diamondUsdRate } = scenario.supply
  const series = useMemo(
    () => buildCumulativeSpendSeries({
      events, dimension, metric, endMinute: scenario.season.days * 1440,
      groupCatalog: dimension === 'guild'
        ? scenario.guilds.map(({ id, name }) => ({ id, label: name }))
        : dimension === 'tier'
          ? [{ id: 'normal', label: '普通' }, { id: 'small', label: '小 R' }, { id: 'whale', label: '大 R' }]
          : scenario.supply.offers,
      colorResolver: id => dimension === 'guild' ? resolveGuildColors(id).main : resolveSemanticColor(dimension, id),
    }),
    [dimension, events, metric, scenario],
  )
  const option = useMemo(() => buildCumulativeSpendOption(series), [series])
  const totals = series.totals.at(-1) ?? { minute: 0, cashUsd: 0, diamonds: 0, ads: 0 }
  const unified = diamondUsdRate === null
    ? null
    : totals.cashUsd + totals.diamonds * diamondUsdRate

  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="cumulative-spend-title">
      <header className="card-header">
        <div><p className="eyebrow">CUMULATIVE CONSUMPTION</p><h2 id="cumulative-spend-title">累计消费仪表盘</h2><p>确定性基准消费</p></div>
        <label>消费指标<select value={metric} onChange={event => setMetric(event.target.value as SpendMetric)}><option value="usd">现金</option><option value="diamond">钻石</option><option value="ad">广告</option></select></label>
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
      <div className="table-scroll">
        <table className="compact-table" aria-label="消费账本汇总">
          <thead><tr><th>分组</th><th>现金</th><th>钻石</th><th>广告</th></tr></thead>
          <tbody>{series.groups.map(group => {
            const total = series.byGroup[group.id].at(-1)!
            return <tr key={group.id}><th scope="row" style={{ color: group.color }}>{group.label}</th><td>{formatSpendValue('usd', total.cashUsd)}</td><td>{formatSpendValue('diamond', total.diamonds)}</td><td>{formatSpendValue('ad', total.ads)}</td></tr>
          })}</tbody>
          <tfoot><tr><th scope="row">账本总计</th><td>{formatSpendValue('usd', totals.cashUsd)}</td><td>{formatSpendValue('diamond', totals.diamonds)}</td><td>{formatSpendValue('ad', totals.ads)}</td></tr></tfoot>
        </table>
      </div>
      {events.length === 0 ? <p>暂无消费事件，当前目录各组累计消费均为零。</p> : null}
      <EChart option={option} className={events.length === 0 ? 'chart--small' : ''} label={`确定性基准累计${{ usd: '现金', diamond: '钻石', ad: '广告' }[metric]}消费`} />
    </section>
  )
}
