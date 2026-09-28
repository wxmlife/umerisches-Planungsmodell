import { useMemo } from 'react'
import { buildScoreOption } from '../charts/options'
import type { MonteCarloResult } from '../domain/aggregate'
import type { SeasonResult } from '../domain/season'
import { EChart } from './EChart'

export function SeasonScorePanel({
  deterministic,
  monteCarlo,
}: { deterministic: SeasonResult; monteCarlo?: MonteCarloResult | null }) {
  const option = useMemo(
    () => buildScoreOption(monteCarlo ?? deterministic),
    [deterministic, monteCarlo],
  )
  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="season-score-title">
      <header className="card-header"><div><p className="eyebrow">SIX-DAY SCORE</p><h2 id="season-score-title">6 日积分曲线</h2></div></header>
      <EChart option={option} label="四个公会的六日累计积分" />
    </section>
  )
}
