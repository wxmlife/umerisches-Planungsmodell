import type { MonteCarloResult } from '../domain/aggregate'
import { createSeededRng } from '../domain/rng'
import type { SeasonResult } from '../domain/season'
import { runSeason } from '../domain/season'
import type {
  SensitivityMetric,
  SensitivityParameter,
  SensitivityResult,
} from '../domain/sensitivity'
import { validateSensitivityRequest } from '../domain/sensitivity'
import type {
  NodeKind,
  Scenario,
  Tier,
  ValidationResult,
} from '../domain/types'
import { validateScenario } from '../domain/validation'

export interface SimulatorAnalysis {
  targetGuildId: string
  targetTier: Tier
  targetNodes: Record<NodeKind, number>
  sweepMin: number
  sweepMax: number
  sweepStep: number
  sensitivityParameter: SensitivityParameter
  sensitivityMetric: SensitivityMetric
}

export type SimulatorAnalysisChoice =
  | 'targetGuildId'
  | 'targetTier'
  | 'sensitivityParameter'
  | 'sensitivityMetric'

export interface SimulatorState {
  draft: Scenario
  validation: ValidationResult
  lastValidScenario: Scenario
  analysis: SimulatorAnalysis
  analysisValidation: ValidationResult
  deterministic: SeasonResult
  monteCarlo: MonteCarloResult | null
  sensitivity: SensitivityResult | null
  runStatus: 'idle' | 'running' | 'cancelling' | 'error'
  progress: { completed: number; total: number } | null
  activeRunId: string | null
  errorMessage: string | null
  stale: boolean
}

export type SimulatorAction =
  | { type: 'set-number'; path: string; value: number }
  | { type: 'set-nullable-number'; path: string; value: number | null }
  | { type: 'set-boolean'; path: string; value: boolean }
  | { type: 'set-string'; path: string; value: string }
  | { type: 'set-analysis-number'; path: string; value: number }
  | { type: 'set-analysis-choice'; path: SimulatorAnalysisChoice; value: string }
  | { type: 'deterministic-result'; scenario: Scenario; result: SeasonResult }
  | { type: 'deterministic-error'; scenario: Scenario; message: string }
  | { type: 'run-start'; runId: string }
  | { type: 'run-progress'; runId: string; completed: number; total: number }
  | { type: 'run-cancelling'; runId: string }
  | { type: 'monte-carlo-result'; runId: string; result: MonteCarloResult }
  | { type: 'sensitivity-result'; runId: string; result: SensitivityResult }
  | { type: 'run-cancelled'; runId: string }
  | { type: 'run-error'; runId: string; message: string }

function writePath<T>(source: T, path: string, value: unknown): T {
  const clone = structuredClone(source)
  const parts = path.split('.')
  let cursor: unknown = clone
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    cursor = Array.isArray(cursor)
      ? cursor[Number(part)]
      : (cursor as Record<string, unknown>)[part]
  }
  const finalPart = parts.at(-1)!
  if (Array.isArray(cursor)) cursor[Number(finalPart)] = value
  else (cursor as Record<string, unknown>)[finalPart] = value
  return clone
}

function updateDraft(
  state: SimulatorState,
  path: string,
  value: number | null | boolean | string,
): SimulatorState {
  const draft = writePath(state.draft, path, value)
  const validation = validateScenario(draft)
  return {
    ...state,
    draft,
    validation,
    analysisValidation: validateAnalysis(draft, state.analysis),
    lastValidScenario: validation.valid ? draft : state.lastValidScenario,
    monteCarlo: validation.valid ? null : state.monteCarlo,
    sensitivity: validation.valid ? null : state.sensitivity,
    runStatus: 'idle',
    progress: null,
    activeRunId: null,
    errorMessage: null,
    stale: true,
  }
}

function validateAnalysis(
  scenario: Scenario,
  analysis: SimulatorAnalysis,
): ValidationResult {
  return validateSensitivityRequest(scenario, {
    parameter: analysis.sensitivityParameter,
    min: analysis.sweepMin,
    max: analysis.sweepMax,
    step: analysis.sweepStep,
    targetGuildId: analysis.targetGuildId,
    targetTier: analysis.targetTier,
  })
}

export function createSimulatorState(scenario: Scenario): SimulatorState {
  const draft = structuredClone(scenario)
  const validation = validateScenario(draft)
  if (!validation.valid) throw new Error('Initial simulator scenario must be valid')
  const analysis: SimulatorAnalysis = {
    targetGuildId: draft.guilds[0]?.id ?? '',
    targetTier: 'whale',
    targetNodes: { normal: 20, core: 2, center: 1 },
    sweepMin: 0,
    sweepMax: 20,
    sweepStep: 5,
    sensitivityParameter: 'supply.versionUsdBudget',
    sensitivityMetric: 'firstPlaceProbability',
  }
  return {
    draft,
    validation,
    lastValidScenario: structuredClone(draft),
    analysis,
    analysisValidation: validateAnalysis(draft, analysis),
    deterministic: runSeason(
      draft,
      createSeededRng(draft.simulation.seed),
      'deterministic',
    ),
    monteCarlo: null,
    sensitivity: null,
    runStatus: 'idle',
    progress: null,
    activeRunId: null,
    errorMessage: null,
    stale: false,
  }
}

export function simulatorReducer(
  state: SimulatorState,
  action: SimulatorAction,
): SimulatorState {
  if (action.type === 'set-number') {
    const nullablePaths = new Set([
      'fans.dailyActionLimit',
    ])
    const nullableValue = (
      nullablePaths.has(action.path)
      || action.path.endsWith('.dailyPurchaseLimit')
    ) && action.value === 0
      ? null
      : action.value
    return updateDraft(
      state,
      action.path,
      nullableValue,
    )
  }
  if (action.type === 'set-nullable-number') {
    return updateDraft(state, action.path, action.value)
  }
  if (action.type === 'set-boolean') {
    return updateDraft(state, action.path, action.value)
  }
  if (action.type === 'set-string') {
    return updateDraft(state, action.path, action.value)
  }
  if (action.type === 'set-analysis-number') {
    const analysis = writePath(state.analysis, action.path, action.value)
    return {
      ...state,
      analysis,
      analysisValidation: validateAnalysis(state.draft, analysis),
      sensitivity: null,
      runStatus: 'idle',
      progress: null,
      activeRunId: null,
      errorMessage: null,
    }
  }
  if (action.type === 'set-analysis-choice') {
    const analysis = {
      ...state.analysis,
      [action.path]: action.value,
    } as SimulatorAnalysis
    return {
      ...state,
      sensitivity: null,
      analysis,
      analysisValidation: validateAnalysis(state.draft, analysis),
      runStatus: 'idle',
      progress: null,
      activeRunId: null,
      errorMessage: null,
    }
  }
  if (action.type === 'deterministic-result') {
    if (!state.validation.valid || action.scenario !== state.lastValidScenario) return state
    return { ...state, deterministic: action.result, stale: false, errorMessage: null }
  }
  if (action.type === 'deterministic-error') {
    if (!state.validation.valid || action.scenario !== state.lastValidScenario) return state
    return {
      ...state,
      stale: true,
      runStatus: 'error',
      errorMessage: action.message,
    }
  }
  if (action.type === 'run-start') {
    return {
      ...state,
      runStatus: 'running',
      progress: { completed: 0, total: 0 },
      activeRunId: action.runId,
      errorMessage: null,
    }
  }
  if (action.runId !== state.activeRunId) return state
  if (action.type === 'run-progress') {
    return {
      ...state,
      progress: { completed: action.completed, total: action.total },
    }
  }
  if (action.type === 'run-cancelling') return { ...state, runStatus: 'cancelling' }
  if (action.type === 'monte-carlo-result') {
    return {
      ...state,
      monteCarlo: action.result,
      runStatus: 'idle',
      progress: null,
      activeRunId: null,
      errorMessage: null,
    }
  }
  if (action.type === 'sensitivity-result') {
    return {
      ...state,
      sensitivity: action.result,
      runStatus: 'idle',
      progress: null,
      activeRunId: null,
      errorMessage: null,
    }
  }
  if (action.type === 'run-cancelled') {
    return {
      ...state,
      runStatus: 'idle',
      progress: null,
      activeRunId: null,
      errorMessage: null,
    }
  }
  return {
    ...state,
    runStatus: 'error',
    progress: null,
    activeRunId: null,
    errorMessage: action.message,
  }
}
