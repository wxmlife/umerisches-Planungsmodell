import { useMemo } from 'react'
import { buildDailyBreakdownOption } from '../charts/options'
import type { SeasonResult } from '../domain/season'
import { EChart } from './EChart'

export function DailyBreakdownPanel({ result }: { result: SeasonResult }) {
  const option = useMemo(() => buildDailyBreakdownOption(result), [result])
  return (
    <section className="dashboard-card" aria-labelledby="daily-breakdown-title">
      <header className="card-header"><h2 id="daily-breakdown-title">每日积分来源</h2></header>
      <EChart option={option} label="每日战斗积分与占领积分堆叠柱" />
    </section>
  )
}
