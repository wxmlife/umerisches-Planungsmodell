import './App.css'
import { ParameterSidebar } from './components/ParameterSidebar'
import { RunToolbar } from './components/RunToolbar'
import { useSimulator } from './state/useSimulator'

function App() {
  const simulator = useSimulator()
  const { state } = simulator

  return (
    <div className="app-shell">
      <ParameterSidebar
        scenario={state.draft}
        validation={state.validation}
        analysis={state.analysis}
        onSetNumber={simulator.setNumber}
        onSetNullableNumber={simulator.setNullableNumber}
        onSetAnalysisNumber={simulator.setAnalysisNumber}
        onSetAnalysisChoice={simulator.setAnalysisChoice}
      />
      <main className="dashboard-shell">
        <RunToolbar
          valid={state.validation.valid}
          status={state.runStatus}
          progress={state.progress}
          onRunMonteCarlo={simulator.runMonteCarlo}
          onRunSensitivity={simulator.runSensitivity}
          onCancel={simulator.cancel}
        />
        <section className="result-placeholder" data-stale={String(state.stale)}>
          <h2>6 日基准推演</h2>
          <p>{state.deterministic.snapshots.length.toLocaleString()} 个快照</p>
        </section>
      </main>
    </div>
  )
}

export default App
