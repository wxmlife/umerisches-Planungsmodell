import { useMemo } from 'react'
import { buildNodeFanOption } from '../charts/options'
import type { SeasonResult } from '../domain/season'
import { EChart } from './EChart'

export function NodeFanPanel({
  result,
  guildId,
}: { result: SeasonResult; guildId: string }) {
  const option = useMemo(() => buildNodeFanOption(result, guildId), [guildId, result])
  return (
    <section className="dashboard-card" aria-labelledby="node-fan-title">
      <header className="card-header"><h2 id="node-fan-title">节点与粉丝曲线</h2><span>{guildId}</span></header>
      <EChart option={option} label={`${guildId} 的节点、可用粉丝、驻守粉丝和损失粉丝`} />
    </section>
  )
}
