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
  const displayScenario = state.validation.valid
    ? state.draft
    : state.lastValidScenario
  const statusMessage = resultStatusMessage({
    valid: state.validation.valid,
    stale: state.stale,
    runStatus: state.runStatus,
  })

  return (
    <div className="app-shell">
      <ParameterSidebar
        scenario={state.draft}
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
          valid={state.validation.valid}
          sensitivityValid={state.analysisValidation.valid}
          status={state.runStatus}
          progress={state.progress}
          errorMessage={state.errorMessage}
          onRunMonteCarlo={simulator.runMonteCarlo}
          onRunSensitivity={simulator.runSensitivity}
          onCancel={simulator.cancel}
        />
        <RecoverySummary scenario={displayScenario} />
        {statusMessage ? <p className="stale-notice" role="status">{statusMessage}</p> : null}
        <div
          className="dashboard-grid"
          data-testid="result-grid"
          data-stale={String(state.stale)}
          aria-busy={state.stale}
        >
          <SeasonScorePanel deterministic={state.deterministic} monteCarlo={state.monteCarlo} seasonDays={displayScenario.season.days} />
          <BattleCalibrationPanel scenario={displayScenario} />
          <DailyBreakdownPanel result={state.deterministic} />
          <NodeFanPanel result={state.deterministic} guildId={state.analysis.targetGuildId} />
          <RankingPanel scenario={displayScenario} deterministic={state.deterministic} monteCarlo={state.monteCarlo} />
          <SupplyEfficiencyPanel guildId={state.analysis.targetGuildId} season={state.deterministic} sensitivity={state.sensitivity} targetNodes={state.analysis.targetNodes} />
          <CumulativeSpendPanel events={state.deterministic.spendEvents} scenario={state.deterministicScenario} />
          <SensitivityPanel
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
      </main>
    </div>
  )
}

export default App
