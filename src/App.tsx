import { BattleCalibrationPanel } from './components/BattleCalibrationPanel'
import { CumulativeSpendPanel } from './components/CumulativeSpendPanel'
import { DailyBreakdownPanel } from './components/DailyBreakdownPanel'
import { NodeFanPanel } from './components/NodeFanPanel'
import { ParameterSidebar } from './components/ParameterSidebar'
import { RankingPanel } from './components/RankingPanel'
import { RunToolbar } from './components/RunToolbar'
import { SeasonScorePanel } from './components/SeasonScorePanel'
import { SensitivityPanel } from './components/SensitivityPanel'
import { SupplyEfficiencyPanel } from './components/SupplyEfficiencyPanel'
import { LocalRecoveryPanel } from './components/LocalRecoveryPanel'
import { compileFormula } from './domain/formula/compiler'
import type { SensitivityMetric, SensitivityParameter } from './domain/sensitivity'
import type { Scenario } from './domain/types'
import { useSimulator } from './state/useSimulator'
import { resultStatusMessage } from './state/resultStatus'

function wholeFans(value: number): string {
  return Math.round(value).toLocaleString('zh-CN')
}

function RecoverySummary({ scenario }: { scenario: Scenario }) {
  const { capacity, naturalCapacityPerDay } = scenario.fans
  const flyer = scenario.supply.offers.find((offer) => offer.id === 'flyer')
  const cheerStick = scenario.supply.offers.find((offer) => offer.id === 'cheer-stick')
  const adRecovery = scenario.supply.offers.find((offer) => offer.id === 'ad-or-diamond-ad')
  const naturalPerHour = capacity * naturalCapacityPerDay / 24
  const flyerPulse = capacity * (flyer?.immediateCapacityRate ?? 0)
  const cheerStickPulse = capacity * (cheerStick?.immediateCapacityRate ?? 0)
  const adTotal = capacity * (adRecovery?.continuousCapacityRate ?? 0)

  return (
    <section className="recovery-summary" aria-labelledby="recovery-summary-title">
      <header>
        <p className="eyebrow">CAPACITY-LINKED RECOVERY</p>
        <h2 id="recovery-summary-title">恢复比例换算</h2>
      </header>
      <div className="recovery-summary__grid">
        <article><span>自然恢复</span><strong>{naturalPerHour.toFixed(1)} / 小时</strong><small>{wholeFans(capacity * naturalCapacityPerDay)} / 24 小时</small></article>
        <article><span>宣传单单脉冲</span><strong>+{wholeFans(flyerPulse)}</strong><small>{((flyer?.immediateCapacityRate ?? 0) * 100).toFixed(0)}% C</small></article>
        <article><span>应援棒单脉冲</span><strong>+{wholeFans(cheerStickPulse)}</strong><small>{((cheerStick?.immediateCapacityRate ?? 0) * 100).toFixed(0)}% C</small></article>
        <article><span>广告 / 钻石恢复</span><strong>{adRecovery?.durationMinutes ?? 0} 分钟 +{wholeFans(adTotal)}</strong><small>{((adRecovery?.continuousCapacityRate ?? 0) * 100).toFixed(0)}% C</small></article>
      </div>
    </section>
  )
}

function App() {
  const simulator = useSimulator()
  const { state } = simulator
  const displayScenario = state.appliedScenario
  const busy = state.pendingScenario !== null || state.validatedRevision !== state.revision
  const resultProps = { className: 'result-content', 'data-stale': String(state.stale), 'aria-busy': busy }
  const scannedVariable = state.analysis.sensitivityParameter === 'battle.alpha' ? 'alpha' : state.analysis.sensitivityParameter === 'battle.beta' ? 'beta' : null
  const unreferencedParameter = scannedVariable && !compileFormula('preRandomPower', displayScenario.battle.formulas.preRandomPower).referencedVariables.includes(scannedVariable)
  const statusMessage = resultStatusMessage({
    valid: state.validation.valid,
    stale: state.stale,
    runStatus: state.runStatus,
  })

  return (
    <div className="app-shell">
      <ParameterSidebar
        scenario={state.draftScenario}
        validation={state.validation}
        analysisValidation={state.analysisValidation}
        analysis={state.analysis}
        onSetNumber={simulator.setNumber}
        onSetNullableNumber={simulator.setNullableNumber}
        onSetBoolean={simulator.setBoolean}
        onSetString={simulator.setString}
        onSetStringArray={simulator.setStringArray}
        onSetAnalysisNumber={simulator.setAnalysisNumber}
        onSetAnalysisChoice={simulator.setAnalysisChoice}
      />
      <main className="dashboard-shell">
        <header className="dashboard-intro">
          <div>
            <p className="eyebrow">LOCAL SIMULATION WORKBENCH</p>
            <h2>六日赛季推演</h2>
          </div>
          <p>聚合地图模型 · 确定性基准自动更新 · 随机分析在本机运行</p>
        </header>
        <RunToolbar
          valid={state.validation.valid && !state.stale}
          sensitivityValid={state.analysisValidation.valid}
          status={state.runStatus}
          progress={state.progress}
          errorMessage={state.errorMessage}
          onRunMonteCarlo={simulator.runMonteCarlo}
          onRunSensitivity={simulator.runSensitivity}
          onCancel={simulator.cancel}
        />
        <LocalRecoveryPanel notice={simulator.storageNotice} recoveryRaw={simulator.recoveryRaw} onClearRecovery={simulator.clearRecovery} onReset={simulator.resetDefaults} />
        <div {...resultProps}><RecoverySummary scenario={displayScenario} /></div>
        {statusMessage ? <p className="stale-notice" role="status">{statusMessage}</p> : null}
        <div
          className="dashboard-grid"
          data-testid="result-grid"
        >
          <div {...resultProps} className="result-content dashboard-card--wide" data-testid="season-results"><SeasonScorePanel deterministic={state.deterministic} monteCarlo={state.monteCarlo} seasonDays={displayScenario.season.days} /></div>
          <BattleCalibrationPanel scenario={displayScenario} calibration={state.calibration} draftScenario={state.draftScenario} validation={state.validation} formulaErrors={state.formulaErrors} stale={state.stale} pending={busy} onSetNumber={simulator.setNumber} onSetString={simulator.setString} onRestore={simulator.restoreFormula} />
          <div {...resultProps}><DailyBreakdownPanel result={state.deterministic} /></div>
          <div {...resultProps}><NodeFanPanel result={state.deterministic} guildId={state.analysis.targetGuildId} /></div>
          <div {...resultProps} className="result-content dashboard-card--wide"><RankingPanel scenario={displayScenario} deterministic={state.deterministic} monteCarlo={state.monteCarlo} /></div>
          <div {...resultProps} className="result-content dashboard-card--wide"><SupplyEfficiencyPanel guildId={state.analysis.targetGuildId} season={state.deterministic} sensitivity={state.sensitivity} targetNodes={state.analysis.targetNodes} /></div>
          <CumulativeSpendPanel events={state.deterministic.spendEvents} scenario={displayScenario} stale={state.stale} busy={busy} />
          <div className="dashboard-card--wide">
          {unreferencedParameter ? <p className="scope-note">当前公式未引用该参数；敏感性曲线可能为水平线。</p> : null}
          <SensitivityPanel
            stale={state.stale}
            busy={busy}
            result={state.sensitivity}
            parameter={state.analysis.sensitivityParameter}
            metric={state.analysis.sensitivityMetric}
            onParameterChange={(parameter: SensitivityParameter) => (
              simulator.setAnalysisChoice('sensitivityParameter', parameter)
            )}
            onMetricChange={(metric: SensitivityMetric) => (
              simulator.setAnalysisChoice('sensitivityMetric', metric)
            )}
          />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
