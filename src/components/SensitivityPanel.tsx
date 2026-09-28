import { useMemo, useState } from 'react'
import { buildSensitivityOption } from '../charts/options'
import type { SensitivityParameter, SensitivityResult } from '../domain/sensitivity'
import { EChart } from './EChart'

const PARAMETERS: Array<{ value: SensitivityParameter; label: string }> = [
  { value: 'battle.alpha', label: '初始粉丝指数 α' },
  { value: 'battle.beta', label: '剩余粉丝指数 β' },
  { value: 'battle.closeLossRate', label: '惜败损耗率' },
  { value: 'score.coreMultiplier', label: '核心节点倍率' },
  { value: 'score.centerMultiplier', label: '中心节点倍率' },
  { value: 'supply.dailyUsdBudget', label: '日付费预算' },
]

export function SensitivityPanel({ result }: { result: SensitivityResult | null }) {
  const [parameter, setParameter] = useState<SensitivityParameter>(
    result?.request.parameter ?? 'supply.dailyUsdBudget',
  )
  const option = useMemo(() => buildSensitivityOption(result), [result])
  return (
    <section className="dashboard-card" aria-labelledby="sensitivity-title">
      <header className="card-header">
        <h2 id="sensitivity-title">参数敏感性曲线</h2>
        <label>扫描参数<select value={parameter} onChange={(event) => setParameter(event.target.value as SensitivityParameter)}>{PARAMETERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </header>
      <EChart option={option} label="单参数敏感性曲线" />
    </section>
  )
}
