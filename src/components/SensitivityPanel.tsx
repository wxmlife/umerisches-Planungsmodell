import { useMemo } from 'react'
import { buildSensitivityOption } from '../charts/options'
import type {
  SensitivityMetric,
  SensitivityParameter,
  SensitivityResult,
} from '../domain/sensitivity'
import { EChart } from './EChart'

const PARAMETERS: Array<{ value: SensitivityParameter; label: string }> = [
  { value: 'battle.alpha', label: '初始粉丝指数 α' },
  { value: 'battle.beta', label: '剩余粉丝指数 β' },
  { value: 'battle.closeLossRate', label: '惜败损耗率' },
  { value: 'score.coreMultiplier', label: '核心节点倍率' },
  { value: 'score.centerMultiplier', label: '中心节点倍率' },
  { value: 'supply.versionUsdBudget', label: '版本付费预算' },
]

const METRICS: Array<{ value: SensitivityMetric; label: string }> = [
  { value: 'battleThreeWinProbability', label: '第 3 场真实胜率' },
  { value: 'finalScoreGap', label: '最终积分差' },
  { value: 'firstPlaceProbability', label: '第一名概率' },
  { value: 'finalNodeCount', label: '最终节点数' },
  { value: 'incrementalScorePerUsd', label: '每美元新增积分' },
]

export function SensitivityPanel({
  result,
  parameter = 'supply.versionUsdBudget',
  metric = 'firstPlaceProbability',
  onParameterChange,
  onMetricChange,
}: {
  result: SensitivityResult | null
  parameter?: SensitivityParameter
  metric?: SensitivityMetric
  onParameterChange?: (parameter: SensitivityParameter) => void
  onMetricChange?: (metric: SensitivityMetric) => void
}) {
  const option = useMemo(() => buildSensitivityOption(result), [result])
  return (
    <section className="dashboard-card" aria-labelledby="sensitivity-title">
      <header className="card-header">
        <h2 id="sensitivity-title">参数敏感性曲线</h2>
        <div className="card-header__controls">
          <label>扫描参数<select value={parameter} onChange={(event) => onParameterChange?.(event.target.value as SensitivityParameter)}>{PARAMETERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>结果指标<select value={metric} onChange={(event) => onMetricChange?.(event.target.value as SensitivityMetric)}>{METRICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
      </header>
      <EChart option={option} label="单参数敏感性曲线" />
    </section>
  )
}
