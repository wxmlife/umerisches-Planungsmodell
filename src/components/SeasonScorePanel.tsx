import { useMemo } from 'react'
import { buildScoreOption } from '../charts/options'
import type { MonteCarloResult } from '../domain/aggregate'
import type { SeasonResult } from '../domain/season'
import { EChart } from './EChart'

export function SeasonScorePanel({
  deterministic,
  monteCarlo,
  seasonDays,
}: { deterministic: SeasonResult; monteCarlo?: MonteCarloResult | null; seasonDays: number }) {
  const option = useMemo(
    () => buildScoreOption(monteCarlo ?? deterministic),
    [deterministic, monteCarlo],
  )
  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="season-score-title">
      <header className="card-header"><div><p className="eyebrow">SEASON SCORE</p><h2 id="season-score-title">{seasonDays} 日积分曲线</h2></div></header>
      <EChart option={option} label={`公会的 ${seasonDays} 日累计积分`} />
    </section>
  )
}
