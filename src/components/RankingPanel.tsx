import type { MonteCarloResult } from '../domain/aggregate'
import type { Scenario } from '../domain/types'
import type { SeasonResult } from '../domain/season'

const TARGET_GAPS: Record<string, number> = { C: 30, B: 60, D: 120 }

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function RankingPanel({
  scenario,
  deterministic,
  monteCarlo,
}: {
  scenario: Scenario
  deterministic: SeasonResult
  monteCarlo?: MonteCarloResult | null
}) {
  const baseScore = monteCarlo?.guilds.A?.finalScore.mean
    ?? deterministic.guilds.A?.totalScore
    ?? 0
  const deterministicOrder = Object.entries(deterministic.guilds)
    .sort((a, b) => b[1].totalScore - a[1].totalScore)
    .map(([guildId]) => guildId)

  const rows = scenario.guilds.map((guild) => {
    const stochastic = monteCarlo?.guilds[guild.id]
    const deterministicScore = deterministic.guilds[guild.id]?.totalScore ?? 0
    const score = stochastic?.finalScore.mean ?? deterministicScore
    const actualGap = guild.id === 'A' || score === 0 ? null : baseScore / score - 1
    return {
      id: guild.id,
      name: guild.name,
      mean: stochastic?.finalScore.mean ?? deterministicScore,
      median: stochastic?.finalScore.median ?? deterministicScore,
      rankOne: stochastic?.rankProbabilities[1]
        ?? (deterministicOrder[0] === guild.id ? 1 : 0),
      actualGap,
    }
  }).sort((a, b) => b.mean - a.mean)

  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="ranking-title">
      <header className="card-header"><h2 id="ranking-title">最终排名</h2></header>
      <div className="table-scroll">
        <table className="ranking-table">
          <thead><tr><th>公会</th><th>平均积分</th><th>中位积分</th><th>第一名概率</th><th>校准差距（展示）</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td>{row.mean.toFixed(1)}</td>
                <td>{row.median.toFixed(1)}</td>
                <td>{percentage(row.rankOne)}</td>
                <td>{TARGET_GAPS[row.id] === undefined
                  ? '—'
                  : `A/${row.id} 实际 ${row.actualGap === null ? '—' : percentage(row.actualGap)} / 目标 +${TARGET_GAPS[row.id]}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
