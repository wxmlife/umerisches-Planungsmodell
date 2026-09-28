import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { DEFAULT_SCENARIO } from '../domain/defaults'
import type { FormulaId } from '../domain/formula/types'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'
import { createSimulatorState, simulatorReducer, type SimulatorAnalysisChoice } from './simulatorReducer'
import { runDeterministicScenario } from './scenarioLifecycle'
import { createPersistedEnvelope, loadPersistedSimulatorState, resetPersistedSimulatorState, savePersistedSimulatorState, RECOVERY_KEY, type SimulatorStorage } from './persistence'

// Access the browser getter inside storage functions' exception boundaries.
const browserStorage: SimulatorStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
}
let runSequence = 0
type WithoutRunId<T> = T extends unknown ? Omit<T, 'runId'> : never
type StartWorkerRequest = WithoutRunId<Exclude<WorkerRequest, { type: 'cancel' }>>

export function useSimulator() {
  const [loaded] = useState(() => loadPersistedSimulatorState(browserStorage))
  const [state, dispatch] = useReducer(simulatorReducer, loaded.state)
  const { draftScenario, appliedScenario, analysis } = state
  const [storageNotice, setStorageNotice] = useState(loaded.notice)
  const [recoveryRaw, setRecoveryRaw] = useState(loaded.recoveryRaw)
  const workerRef = useRef<Worker | null>(null)
  const activeRunIdRef = useRef<string | null>(null)
  const savedInputs = useRef({ draft: state.draftScenario, applied: state.appliedScenario, analysis: state.analysis })
  const skipSave = useRef(false)

  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined
    const worker = new Worker(new URL('../worker/monteCarlo.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (!message || typeof message !== 'object' || message.runId !== activeRunIdRef.current) return
      if (message.type === 'progress') {
        dispatch({ type: 'run-progress', runId: message.runId, completed: message.completed, total: message.total })
      } else if (message.type === 'result') {
        activeRunIdRef.current = null
        dispatch({ type: 'monte-carlo-result', runId: message.runId, result: message.result })
      } else if (message.type === 'sensitivity-result') {
        activeRunIdRef.current = null
        dispatch({ type: 'sensitivity-result', runId: message.runId, result: message.result })
      } else if (message.type === 'cancelled') {
        activeRunIdRef.current = null
        dispatch({ type: 'run-cancelled', runId: message.runId })
      } else {
        activeRunIdRef.current = null
        dispatch({ type: 'run-error', runId: message.runId, error: message.error })
      }
    })
    worker.addEventListener('error', () => {
      const runId = activeRunIdRef.current
      activeRunIdRef.current = null
      if (runId) dispatch({ type: 'run-error', runId, error: null })
    })
    return () => { worker.terminate(); workerRef.current = null }
  }, [])

  useEffect(() => {
    if (state.validatedRevision === state.revision) return
    const timeout = window.setTimeout(() => dispatch({ type: 'validate-draft', revision: state.revision }), state.validationDelay)
    return () => window.clearTimeout(timeout)
  }, [state.revision, state.validatedRevision, state.validationDelay])

  useEffect(() => {
    const pending = state.pendingScenario
    if (!pending) return
    const timeout = window.setTimeout(() => {
      try {
        const result = runDeterministicScenario(pending.scenario)
        dispatch({ type: 'deterministic-result', revision: pending.revision, result: result.deterministic, calibration: result.calibration })
      } catch (error) {
        dispatch({ type: 'deterministic-error', revision: pending.revision, error })
        if (pending.revision === loaded.state.pendingScenario?.revision && loaded.sourceRaw !== null) {
          setRecoveryRaw(loaded.sourceRaw)
          try {
            browserStorage.setItem(RECOVERY_KEY, loaded.sourceRaw)
            setStorageNotice('恢复的草稿首次推演失败，原始内容已保留在恢复备份中。')
          } catch { setStorageNotice('恢复的草稿推演失败，备份无法写入本机，请复制保存。') }
        }
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [state.pendingScenario, loaded])

  useEffect(() => {
    const previous = savedInputs.current
    const changed = previous.draft !== draftScenario || previous.applied !== appliedScenario || previous.analysis !== analysis
    savedInputs.current = { draft: draftScenario, applied: appliedScenario, analysis }
    if (skipSave.current) { skipSave.current = false; return }
    if (!changed) return
    const envelope = createPersistedEnvelope({ draftScenario, appliedScenario, analysis })
    const save = () => {
      const notice = savePersistedSimulatorState(browserStorage, envelope)
      if (notice) setStorageNotice(notice)
    }
    // Successful application writes immediately; draft and analysis edits debounce.
    if (previous.applied !== appliedScenario) { save(); return }
    const timeout = window.setTimeout(save, 300)
    return () => window.clearTimeout(timeout)
  }, [draftScenario, appliedScenario, analysis])

  const invalidateActiveRun = useCallback(() => {
    const runId = activeRunIdRef.current
    if (!runId) return
    workerRef.current?.postMessage({ type: 'cancel', runId } satisfies WorkerRequest)
    activeRunIdRef.current = null
  }, [])

  const startWorkerRun = useCallback((request: StartWorkerRequest) => {
    if (state.stale || !state.validation.valid || !workerRef.current) return
    invalidateActiveRun()
    const runId = `simulation-${Date.now()}-${++runSequence}`
    activeRunIdRef.current = runId
    dispatch({ type: 'run-start', runId })
    workerRef.current.postMessage({ ...request, runId } satisfies WorkerRequest)
  }, [state.stale, state.validation.valid, invalidateActiveRun])

  const runMonteCarlo = useCallback(() => startWorkerRun({
    type: 'run', scenario: state.appliedScenario, runs: state.appliedScenario.simulation.runs, seed: state.appliedScenario.simulation.seed,
  }), [startWorkerRun, state.appliedScenario])

  const runSensitivityAnalysis = useCallback(() => {
    if (!state.analysisValidation.valid) return
    startWorkerRun({
      type: 'sensitivity', scenario: state.appliedScenario,
      request: {
        parameter: state.analysis.sensitivityParameter, metric: state.analysis.sensitivityMetric,
        min: state.analysis.sweepMin, max: state.analysis.sweepMax, step: state.analysis.sweepStep,
        targetGuildId: state.analysis.targetGuildId, targetTier: state.analysis.targetTier,
        runs: Math.min(state.appliedScenario.simulation.runs, 200), seed: state.appliedScenario.simulation.seed,
      },
    })
  }, [startWorkerRun, state.analysis, state.analysisValidation.valid, state.appliedScenario])

  const cancel = useCallback(() => {
    const runId = activeRunIdRef.current
    if (!runId || !workerRef.current) return
    dispatch({ type: 'run-cancelling', runId })
    workerRef.current.postMessage({ type: 'cancel', runId } satisfies WorkerRequest)
  }, [])

  return {
    state, storageNotice, recoveryRaw,
    setNumber: (path: string, value: number) => { invalidateActiveRun(); dispatch({ type: 'set-number', path, value }) },
    setNullableNumber: (path: string, value: number | null) => { invalidateActiveRun(); dispatch({ type: 'set-nullable-number', path, value }) },
    setBoolean: (path: string, value: boolean) => { invalidateActiveRun(); dispatch({ type: 'set-boolean', path, value }) },
    setString: (path: string, value: string) => { invalidateActiveRun(); dispatch({ type: 'set-string', path, value }) },
    setStringArray: (path: string, value: string[]) => { invalidateActiveRun(); dispatch({ type: 'set-string-array', path, value }) },
    restoreFormula: (formulaId: FormulaId, source: 'applied' | 'default') => { invalidateActiveRun(); dispatch({ type: 'restore-formula', formulaId, source }) },
    setAnalysisNumber: (path: string, value: number) => { invalidateActiveRun(); dispatch({ type: 'set-analysis-number', path, value }) },
    setAnalysisChoice: (path: SimulatorAnalysisChoice, value: string) => { invalidateActiveRun(); dispatch({ type: 'set-analysis-choice', path, value }) },
    clearRecovery: () => {
      try { browserStorage.removeItem(RECOVERY_KEY); setRecoveryRaw(null) } catch { setStorageNotice('恢复备份清除失败，请检查浏览器存储权限。') }
    },
    resetDefaults: () => {
      invalidateActiveRun()
      skipSave.current = true
      const notice = resetPersistedSimulatorState(browserStorage)
      setStorageNotice(notice)
      if (!notice) setRecoveryRaw(null)
      dispatch({ type: 'reset', state: createSimulatorState(DEFAULT_SCENARIO) })
    },
    runMonteCarlo, runSensitivity: runSensitivityAnalysis, cancel,
  }
}
