import type { Scenario, ValidationResult } from '../domain/types'
import { NumberSlider } from './NumberSlider'

export interface BattleQuickControlsProps {
  scenario: Scenario
  validation: ValidationResult
  onSetNumber: (path: string, value: number) => void
  onSetString: (path: string, value: string) => void
}

export function BattleQuickControls({ scenario, validation, onSetNumber, onSetString }: BattleQuickControlsProps) {
  const { battle } = scenario
  const control = (path: string, label: string, value: number, min: number, max: number, step: number) => <NumberSlider key={path} idPrefix="battle-quick" path={path} label={label} value={value} min={min} max={max} step={step} onChange={onSetNumber} error={validation.issues.find(issue => issue.path === path || path.startsWith(`${issue.path}.`))?.message} />
  return <div className="battle-quick-controls">
    {control('battle.baseIdolPower', '普通玩家五人原始战力', battle.baseIdolPower, 1, 2_000_000, 1000)}
    {control('battle.tierMultipliers.small', '小 R 战力倍率', battle.tierMultipliers.small, 0.1, 20, 0.1)}
    {control('battle.tierMultipliers.whale', '大 R 战力倍率', battle.tierMultipliers.whale, 0.1, 20, 0.1)}
    {control('battle.alpha', '初始粉丝指数 α', battle.alpha, 0, 4, 0.01)}
    {control('battle.beta', '剩余粉丝指数 β', battle.beta, 0, 5, 0.01)}
    {control('battle.styleAdvantage', '风格优势比例', battle.styleAdvantage, 0, 0.5, 0.01)}
    <label className="select-control">校准风格关系<select value={battle.calibrationStyle} onChange={event => onSetString('battle.calibrationStyle', event.target.value)}><option value="neutral">中性</option><option value="attacker-advantage">进攻方风格优势</option><option value="attacker-disadvantage">进攻方风格劣势</option></select></label>
    {control('battle.randomMin', '随机波动下限', battle.randomMin, 0.1, 2, 0.01)}
    {control('battle.randomMax', '随机波动上限', battle.randomMax, 0.1, 2, 0.01)}
    {control('battle.homeLossFactor', '主场损耗系数', battle.homeLossFactor, 0, 2, 0.01)}
    <details className="battle-loss-controls"><summary>损耗档位</summary><div className="battle-quick-controls">{battle.lossBands.flatMap((band, index) => [
      control(`battle.lossBands.${index}.minRatio`, `损耗档位 ${index + 1} 最低战力比`, band.minRatio, 0, 10, 0.01),
      control(`battle.lossBands.${index}.rate`, `损耗档位 ${index + 1} 损耗率`, band.rate, 0, 1, 0.01),
    ])}</div></details>
  </div>
}
