import { useMemo, useState } from 'react'
import { buildBattleOption } from '../charts/options'
import { DEFAULT_SCENARIO } from '../domain/defaults'
import type { Scenario, ValidationResult } from '../domain/types'
import { buildCalibration, type CalibrationResult } from '../state/scenarioLifecycle'
import { BattleFormulaEditor, type BattleFormulaEditorProps } from './BattleFormulaEditor'
import { BattleQuickControls } from './BattleQuickControls'
import { EChart } from './EChart'
import { buildBattleDetail, type BattleDetailRow } from '../domain/battleDetail'

const EMPTY_CALIBRATION: CalibrationResult = { equalFans: [], doubleFans: [] }

export interface BattleCalibrationPanelProps {
  scenario?: Scenario
  calibration?: CalibrationResult
  draftScenario?: Scenario
  validation?: ValidationResult
  formulaErrors?: BattleFormulaEditorProps['errors']
  pending?: boolean
  stale?: boolean
  onSetNumber?: (path: string, value: number) => void
  onSetString?: BattleFormulaEditorProps['onSetString']
  onRestore?: BattleFormulaEditorProps['onRestore']
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function BattleCalibrationPanel({
  scenario = DEFAULT_SCENARIO,
  calibration,
  draftScenario,
  validation = { valid: true, issues: [] },
  formulaErrors = {}, pending = false, stale = false,
  onSetNumber, onSetString, onRestore,
}: BattleCalibrationPanelProps) {
  const styleLabel = scenario.battle.calibrationStyle === 'attacker-advantage'
    ? '进攻方风格优势'
    : scenario.battle.calibrationStyle === 'attacker-disadvantage'
      ? '进攻方风格劣势'
      : '中性风格'
  const results = useMemo(() => {
    if (calibration) return calibration
    try { return buildCalibration(scenario) } catch { return null }
  }, [calibration, scenario])
  const { equalFans, doubleFans } = results ?? EMPTY_CALIBRATION
  const option = useMemo(
    () => buildBattleOption(equalFans, doubleFans),
    [equalFans, doubleFans],
  )
  const [detailCase, setDetailCase] = useState<'case1' | 'case2'>('case1')
  const detailRows = useMemo(() => detailCase === 'case1'
    ? buildBattleDetail({ attackerIdolPower: 100_000, defenderIdolPower: 400_000, attackerInitialFans: 1_000, defenderInitialFans: 1_000, seed: scenario.simulation.seed })
    : buildBattleDetail({ attackerIdolPower: 100_000, defenderIdolPower: 300_000, attackerInitialFans: 2_000, defenderInitialFans: 1_000, seed: scenario.simulation.seed + 1 }), [detailCase, scenario.simulation.seed])

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
      {draftScenario && onSetNumber && onSetString && onRestore ? <details className="battle-settings" open>
        <summary>战斗力设定与公式</summary>
        <p className="scope-note">风格关系仅影响连续挑战校准；赛季推演使用中性风格倍率 1。</p>
        <BattleQuickControls scenario={draftScenario} validation={validation} onSetNumber={onSetNumber} onSetString={onSetString} />
        <details className="formula-details"><summary>编辑战斗公式</summary><BattleFormulaEditor draftScenario={draftScenario} appliedScenario={scenario} errors={formulaErrors} pending={pending} onSetString={onSetString} onRestore={onRestore} /></details>
      </details> : null}
      <div className="result-content" data-stale={String(stale)} aria-busy={pending}>
      <p className="calibration-context">
        小 R ×{scenario.battle.tierMultipliers.small} vs 大 R ×{scenario.battle.tierMultipliers.whale} · {styleLabel}
      </p>
      <p className="calibration-derived">已应用原始战力：普通 {(scenario.battle.baseIdolPower * scenario.battle.tierMultipliers.normal).toLocaleString('zh-CN')} · 小 R {(scenario.battle.baseIdolPower * scenario.battle.tierMultipliers.small).toLocaleString('zh-CN')} · 大 R {(scenario.battle.baseIdolPower * scenario.battle.tierMultipliers.whale).toLocaleString('zh-CN')}</p>
      {results ? <p className="calibration-derived">首场有效战力：{Math.round(equalFans[0].attackerPrePower).toLocaleString('zh-CN')} / {Math.round(equalFans[0].defenderPrePower).toLocaleString('zh-CN')} · 守方期望损失 {equalFans[0].defenderLoss} 粉丝</p> : <p role="alert">连续挑战计算失败，请检查已应用方案。</p>}
      <EChart option={option} label="连续挑战的显示倾向、真实胜率与守方粉丝曲线" />
      <div className="table-pair">
        {table('1,000 vs 1,000', equalFans.slice(0, 3))}
        {table('2,000 vs 1,000', doubleFans.slice(0, 2))}
      </div>
      </div>
      <div className="battle-detail" aria-labelledby="battle-detail-title">
        <div className="battle-detail-header">
          <div><p className="eyebrow">ROUND DETAIL</p><h3 id="battle-detail-title">5 位 IDOL × 5 轮对决明细</h3></div>
          <label className="select-control">表格案例<select value={detailCase} onChange={(event) => setDetailCase(event.target.value as 'case1' | 'case2')}>
            <option value="case1">Case1：同粉丝（100,000 vs 400,000）</option>
            <option value="case2">Case2：攻方粉丝翻倍（100,000 vs 300,000）</option>
          </select></label>
        </div>
        <p className="scope-note">逐轮按 5 个 IDOL 独立抽取攻方克制 / 无克制 / 守方克制，再合成战力、计算胜率和双方粉丝损耗。随机种子来自当前模拟方案，改参数后明细会同步刷新。</p>
        <DetailTable rows={detailRows} />
      </div>
    </section>
  )
}

function DetailTable({ rows }: { rows: BattleDetailRow[] }) {
  return <div className="table-scroll"><table className="compact-table battle-detail-table">
    <thead><tr><th>轮次</th><th>攻方粉丝→损耗</th><th>守方粉丝→损耗</th><th>攻方战力</th><th>守方战力</th><th>显示倾向</th><th>真实胜率</th><th>结果</th><th>IDOL1</th><th>IDOL2</th><th>IDOL3</th><th>IDOL4</th><th>IDOL5</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.round}>
      <td>{row.round}</td><td>{row.attackerFans.toLocaleString('zh-CN')} → -{row.attackerLoss}</td><td>{row.defenderFans.toLocaleString('zh-CN')} → -{row.defenderLoss}</td>
      <td>{Math.round(row.attackerPower).toLocaleString('zh-CN')}</td><td>{Math.round(row.defenderPower).toLocaleString('zh-CN')}</td><td>{percent(row.displayedTendency)}</td><td>{percent(row.actualWinProbability)}</td>
      <td>{row.attackerWon ? '攻方胜' : '守方胜'}</td>{row.idolMatchups.map((status, index) => <td key={index} title={`抽样值 ${row.idolRolls[index].toFixed(3)}`}>{status.replace('克制', '')}</td>)}
    </tr>)}</tbody>
  </table></div>
}
