import { useCallback, useEffect, useReducer, useRef } from 'react'
import { DEFAULT_SCENARIO } from '../domain/defaults'
import { createSeededRng } from '../domain/rng'
import { runSeason } from '../domain/season'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'
import { eventLimitMessage } from '../worker/runner'
import {
  createSimulatorState,
  simulatorReducer,
  type SimulatorAnalysisChoice,
} from './simulatorReducer'

let runSequence = 0

type WithoutRunId<T> = T extends unknown ? Omit<T, 'runId'> : never
type StartWorkerRequest = WithoutRunId<Exclude<WorkerRequest, { type: 'cancel' }>>

function nextRunId(): string {
  runSequence += 1
  return `simulation-${Date.now()}-${runSequence}`
}

export function useSimulator() {
  const [state, dispatch] = useReducer(
    simulatorReducer,
    DEFAULT_SCENARIO,
    createSimulatorState,
  )
  const workerRef = useRef<Worker | null>(null)
  const activeRunIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined
    const worker = new Worker(
      new URL('../worker/monteCarlo.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.runId !== activeRunIdRef.current) return
      if (message.type === 'progress') {
        dispatch({
          type: 'run-progress',
          runId: message.runId,
          completed: message.completed,
          total: message.total,
        })
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
        dispatch({ type: 'run-error', runId: message.runId, message: message.message })
      }
    })
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!state.validation.valid) return undefined
    const scenario = state.lastValidScenario
    const timeout = window.setTimeout(() => {
      try {
        const result = runSeason(
          scenario,
          createSeededRng(scenario.simulation.seed),
          'deterministic',
        )
        if (result.termination === 'event-limit') {
          dispatch({
            type: 'deterministic-error',
            scenario,
            message: eventLimitMessage(scenario, result),
          })
        } else {
          dispatch({ type: 'deterministic-result', scenario, result })
        }
      } catch (error) {
        dispatch({
          type: 'deterministic-error',
          scenario,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [state.lastValidScenario, state.validation.valid])

  const invalidateActiveRun = useCallback(() => {
    const runId = activeRunIdRef.current
    if (!runId) return
    workerRef.current?.postMessage({ type: 'cancel', runId } satisfies WorkerRequest)
    activeRunIdRef.current = null
  }, [])

  const startWorkerRun = useCallback((request: StartWorkerRequest) => {
    if (!state.validation.valid || !workerRef.current) return
    if (activeRunIdRef.current) {
      workerRef.current.postMessage({
        type: 'cancel',
        runId: activeRunIdRef.current,
      } satisfies WorkerRequest)
    }
    const runId = nextRunId()
    activeRunIdRef.current = runId
    dispatch({ type: 'run-start', runId })
    if (request.type === 'run') {
      workerRef.current.postMessage({ ...request, runId } satisfies WorkerRequest)
    } else {
      workerRef.current.postMessage({ ...request, runId } satisfies WorkerRequest)
    }
  }, [state.validation.valid])

  const runMonteCarlo = useCallback(() => {
    startWorkerRun({
      type: 'run',
      scenario: state.lastValidScenario,
      runs: state.lastValidScenario.simulation.runs,
      seed: state.lastValidScenario.simulation.seed,
    })
  }, [startWorkerRun, state.lastValidScenario])

  const runSensitivityAnalysis = useCallback(() => {
    if (!state.analysisValidation.valid) return
    startWorkerRun({
      type: 'sensitivity',
      scenario: state.lastValidScenario,
      request: {
        parameter: state.analysis.sensitivityParameter,
        metric: state.analysis.sensitivityMetric,
        min: state.analysis.sweepMin,
        max: state.analysis.sweepMax,
        step: state.analysis.sweepStep,
        targetGuildId: state.analysis.targetGuildId,
        targetTier: state.analysis.targetTier,
        runs: Math.min(state.lastValidScenario.simulation.runs, 200),
        seed: state.lastValidScenario.simulation.seed,
      },
    })
  }, [startWorkerRun, state.analysis, state.analysisValidation.valid, state.lastValidScenario])

  const cancel = useCallback(() => {
    const runId = activeRunIdRef.current
    if (!runId || !workerRef.current) return
    dispatch({ type: 'run-cancelling', runId })
    workerRef.current.postMessage({ type: 'cancel', runId } satisfies WorkerRequest)
  }, [])

  return {
    state,
    setNumber: (path: string, value: number) => {
      invalidateActiveRun()
      dispatch({ type: 'set-number', path, value })
    },
    setNullableNumber: (path: string, value: number | null) => {
      invalidateActiveRun()
      dispatch({ type: 'set-nullable-number', path, value })
    },
    setBoolean: (path: string, value: boolean) => {
      invalidateActiveRun()
      dispatch({ type: 'set-boolean', path, value })
    },
    setString: (path: string, value: string) => {
      invalidateActiveRun()
      dispatch({ type: 'set-string', path, value })
    },
    setStringArray: (path: string, value: string[]) => {
      invalidateActiveRun()
      dispatch({ type: 'set-string-array', path, value })
    },
    setAnalysisNumber: (path: string, value: number) => {
      invalidateActiveRun()
      dispatch({ type: 'set-analysis-number', path, value })
    },
    setAnalysisChoice: (path: SimulatorAnalysisChoice, value: string) => {
      invalidateActiveRun()
      dispatch({ type: 'set-analysis-choice', path, value })
    },
    runMonteCarlo,
    runSensitivity: runSensitivityAnalysis,
    cancel,
  }
}
