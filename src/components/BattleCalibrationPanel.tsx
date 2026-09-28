import { useMemo } from 'react'
import { buildBattleOption } from '../charts/options'
import { buildAttritionSeries } from '../domain/battle'
import { DEFAULT_SCENARIO } from '../domain/defaults'
import type { Scenario } from '../domain/types'
import { EChart } from './EChart'

export interface BattleCalibrationPanelProps {
  scenario?: Scenario
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function BattleCalibrationPanel({
  scenario = DEFAULT_SCENARIO,
}: BattleCalibrationPanelProps) {
  const attackerStyleMultiplier = scenario.battle.calibrationStyle === 'attacker-advantage'
    ? 1 + scenario.battle.styleAdvantage
    : scenario.battle.calibrationStyle === 'attacker-disadvantage'
      ? 1 - scenario.battle.styleAdvantage
      : 1
  const defenderStyleMultiplier = scenario.battle.calibrationStyle === 'attacker-advantage'
    ? 1 - scenario.battle.styleAdvantage
    : scenario.battle.calibrationStyle === 'attacker-disadvantage'
      ? 1 + scenario.battle.styleAdvantage
      : 1
  const styleLabel = scenario.battle.calibrationStyle === 'attacker-advantage'
    ? '进攻方风格优势'
    : scenario.battle.calibrationStyle === 'attacker-disadvantage'
      ? '进攻方风格劣势'
      : '中性风格'
  const equalFans = useMemo(() => buildAttritionSeries(scenario.battle, {
    attackerIdolPower: scenario.battle.baseIdolPower
      * scenario.battle.tierMultipliers.small,
    defenderIdolPower: scenario.battle.baseIdolPower
      * scenario.battle.tierMultipliers.whale,
    attackerInitialFans: 1000,
    defenderInitialFans: 1000,
    battles: 6,
    attackerStyleMultiplier,
    defenderStyleMultiplier,
  }), [attackerStyleMultiplier, defenderStyleMultiplier, scenario.battle])
  const doubleFans = useMemo(() => buildAttritionSeries(scenario.battle, {
    attackerIdolPower: scenario.battle.baseIdolPower
      * scenario.battle.tierMultipliers.small,
    defenderIdolPower: scenario.battle.baseIdolPower
      * scenario.battle.tierMultipliers.whale,
    attackerInitialFans: 2000,
    defenderInitialFans: 1000,
    battles: 6,
    attackerStyleMultiplier,
    defenderStyleMultiplier,
  }), [attackerStyleMultiplier, defenderStyleMultiplier, scenario.battle])
  const option = useMemo(
    () => buildBattleOption(equalFans, doubleFans),
    [equalFans, doubleFans],
  )

  const table = (label: string, rows: typeof equalFans) => (
    <table className="compact-table">
      <caption>{label}</caption>
      <thead>
        <tr><th>场次</th><th>守方粉丝</th><th>显示倾向</th><th>真实胜率</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.battle}>
            <td>{row.battle}</td>
            <td>{row.defenderFans.toLocaleString('zh-CN')}</td>
            <td>{percent(row.displayedTendency)}</td>
            <td>{percent(row.actualWinProbability)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <section className="dashboard-card dashboard-card--wide" aria-labelledby="battle-calibration-title">
      <header className="card-header">
        <div><p className="eyebrow">BATTLE CALIBRATION</p><h2 id="battle-calibration-title">连续挑战曲线</h2></div>
      </header>
      <p className="calibration-context">
        小 R ×{scenario.battle.tierMultipliers.small} vs 大 R ×{scenario.battle.tierMultipliers.whale} · {styleLabel}
      </p>
      <EChart option={option} label="连续挑战的显示倾向、真实胜率与守方粉丝曲线" />
      <div className="table-pair">
        {table('1,000 vs 1,000', equalFans.slice(0, 3))}
        {table('2,000 vs 1,000', doubleFans.slice(0, 2))}
      </div>
    </section>
  )
}
