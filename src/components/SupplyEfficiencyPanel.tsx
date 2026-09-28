import { useMemo } from 'react'
import { buildSupplyEfficiencyOption } from '../charts/options'
import type { NodeKind } from '../domain/types'
import type { SeasonResult } from '../domain/season'
import {
  deriveNodeTargetThreshold,
  deriveSpendThresholds,
  type SensitivityResult,
} from '../domain/sensitivity'
import { EChart } from './EChart'

export function SupplyEfficiencyPanel({
  guildId,
  season,
  sensitivity,
  targetNodes,
}: {
  guildId: string
  season: SeasonResult
  sensitivity: SensitivityResult | null
  targetNodes?: Record<NodeKind, number>
}) {
  const guild = season.guilds[guildId]
  const isBudgetSweep = sensitivity?.request.parameter === 'supply.dailyUsdBudget'
  const budgetSensitivity = isBudgetSweep ? sensitivity : null
  const option = useMemo(
    () => buildSupplyEfficiencyOption(guild, budgetSensitivity),
    [budgetSensitivity, guild],
  )
  const thresholds = budgetSensitivity
    ? deriveSpendThresholds(budgetSensitivity.points)
    : { dailyBudget50: null, dailyBudget80: null }
  const nodeThreshold = budgetSensitivity && targetNodes
    ? deriveNodeTargetThreshold(budgetSensitivity.points, targetNodes)
    : null
  const unavailable = isBudgetSweep ? '未达到' : '需运行日预算扫描'
  const highestBudgetPoint = budgetSensitivity?.points.toSorted((a, b) => a.x - b.x).at(-1)
  const actionCapacityBound = highestBudgetPoint?.actionCapacityBound ?? false

  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="supply-efficiency-title">
      <header className="card-header"><div><p className="eyebrow">SUPPLY EFFICIENCY</p><h2 id="supply-efficiency-title">补给与效率曲线</h2></div><span>{guildId}</span></header>
      <div className="metric-grid">
        <article className="metric-card"><span>第一名概率 50%</span><strong>{thresholds.dailyBudget50 === null ? unavailable : `$${thresholds.dailyBudget50.toFixed(2)} / 日`}</strong></article>
        <article className="metric-card"><span>第一名概率 80%</span><strong>{thresholds.dailyBudget80 === null ? unavailable : `$${thresholds.dailyBudget80.toFixed(2)} / 日`}</strong></article>
        {targetNodes ? <article className="metric-card"><span>节点目标最低预算</span><strong>{nodeThreshold === null ? unavailable : `$${nodeThreshold.toFixed(2)} / 日`}</strong></article> : null}
      </div>
      {isBudgetSweep && targetNodes && nodeThreshold === null && actionCapacityBound
        ? <p className="capacity-warning">资源足够，行动容量不足</p>
        : null}
      <div className="table-scroll">
        <table className="compact-table">
          <thead><tr><th>来源</th><th>理论粉丝</th><th>实际入池</th><th>浪费</th><th>利用率</th></tr></thead>
          <tbody>
            {Object.entries(guild?.supplyBySource ?? {}).map(([source, value]) => (
              <tr key={source}>
                <th scope="row">{source}</th>
                <td>{value.theoreticalFans.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}</td>
                <td>{value.acceptedFans.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}</td>
                <td>{value.wastedFans.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}</td>
                <td>{value.theoreticalFans > 0 ? `${(value.acceptedFans / value.theoreticalFans * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EChart option={option} label="补给理论、实际、浪费、积分效率与第一名概率" />
    </section>
  )
}
