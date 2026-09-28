import type { MonteCarloResult } from '../domain/aggregate'
import { DEFAULT_BATTLE_FORMULAS } from '../domain/defaults'
import type { FormulaErrorDto, FormulaId } from '../domain/formula/types'
import { normalizeFormulaError } from '../domain/formula/types'
import type { SeasonResult } from '../domain/season'
import type { SensitivityMetric, SensitivityParameter, SensitivityResult } from '../domain/sensitivity'
import { validateSensitivityRequest } from '../domain/sensitivity'
import type { NodeKind, Scenario, Tier, ValidationResult } from '../domain/types'
import { validateScenario } from '../domain/validation'
import { runDeterministicScenario, validateDraftScenario, type CalibrationResult } from './scenarioLifecycle'

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
export type SimulatorAnalysisChoice = 'targetGuildId' | 'targetTier' | 'sensitivityParameter' | 'sensitivityMetric'

export interface SimulatorState {
  draftScenario: Scenario
  pendingScenario: { revision: number; scenario: Scenario } | null
  appliedScenario: Scenario
  revision: number
  validatedRevision: number
  validationDelay: number
  validation: ValidationResult
  formulaErrors: Partial<Record<FormulaId, FormulaErrorDto>>
  analysis: SimulatorAnalysis
  analysisValidation: ValidationResult
  deterministic: SeasonResult
  calibration: CalibrationResult
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
  | { type: 'set-string-array'; path: string; value: string[] }
  | { type: 'restore-formula'; formulaId: FormulaId; source: 'applied' | 'default' }
  | { type: 'validate-draft'; revision: number }
  | { type: 'reset'; state: SimulatorState }
  | { type: 'set-analysis-number'; path: string; value: number }
  | { type: 'set-analysis-choice'; path: SimulatorAnalysisChoice; value: string }
  | { type: 'deterministic-result'; revision: number; result: SeasonResult; calibration: CalibrationResult }
  | { type: 'deterministic-error'; revision: number; error: unknown }
  | { type: 'run-start'; runId: string }
  | { type: 'run-progress'; runId: string; completed: number; total: number }
  | { type: 'run-cancelling'; runId: string }
  | { type: 'monte-carlo-result'; runId: string; result: MonteCarloResult }
  | { type: 'sensitivity-result'; runId: string; result: SensitivityResult }
  | { type: 'run-cancelled'; runId: string }
  | { type: 'run-error'; runId: string; error: unknown }

function writePath<T>(source: T, path: string, value: unknown): T {
  const clone = structuredClone(source)
  const parts = path.split('.')
  let cursor: unknown = clone
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    cursor = Array.isArray(cursor) ? cursor[Number(part)] : (cursor as Record<string, unknown>)[part]
  }
  const finalPart = parts.at(-1)!
  if (Array.isArray(cursor)) cursor[Number(finalPart)] = value
  else (cursor as Record<string, unknown>)[finalPart] = value
  return clone
}

const stoppedRun = { runStatus: 'idle' as const, progress: null, activeRunId: null, errorMessage: null }

function updateDraft(state: SimulatorState, path: string, value: unknown): SimulatorState {
  const draftScenario = writePath(state.draftScenario, path, structuredClone(value))
  const formulaEdit = path.startsWith('battle.formulas.')
  // Formula parsing is deferred; numeric errors remain immediate beside controls.
  const checked = formulaEdit
    ? { validation: validateScenario(draftScenario), formulaErrors: {} }
    : validateDraftScenario(draftScenario)
  return {
    ...state, ...stoppedRun, ...checked, draftScenario,
    revision: state.revision + 1, validationDelay: formulaEdit ? 300 : 0,
    pendingScenario: null, analysisValidation: validateAnalysis(draftScenario, state.analysis),
    monteCarlo: null, sensitivity: null, stale: true,
  }
}

export function validateAnalysis(scenario: Scenario, analysis: SimulatorAnalysis): ValidationResult {
  let result: ValidationResult
  try {
    result = validateSensitivityRequest(scenario, {
      parameter: analysis.sensitivityParameter, min: analysis.sweepMin, max: analysis.sweepMax,
      step: analysis.sweepStep, targetGuildId: analysis.targetGuildId, targetTier: analysis.targetTier,
    })
  } catch {
    result = { valid: false, issues: [{ path: 'analysis.sensitivityParameter', message: '当前场景无法扫描该参数，请检查对应损耗档位或分析目标。' }] }
  }
  for (const kind of ['normal', 'core', 'center'] as const) {
    if (!Number.isInteger(analysis.targetNodes[kind]) || analysis.targetNodes[kind] < 0) {
      result.issues.push({ path: `analysis.targetNodes.${kind}`, message: '目标节点数必须是非负整数' })
    }
  }
  return { valid: result.issues.length === 0, issues: result.issues }
}

export function createDefaultAnalysis(scenario: Scenario): SimulatorAnalysis {
  return {
    targetGuildId: scenario.guilds[0]?.id ?? '', targetTier: 'whale',
    targetNodes: { normal: 20, core: 2, center: 1 }, sweepMin: 0, sweepMax: 120, sweepStep: 30,
    sensitivityParameter: 'supply.versionUsdBudget', sensitivityMetric: 'firstPlaceProbability',
  }
}

export function createSimulatorState(scenario: Scenario): SimulatorState {
  const draftScenario = structuredClone(scenario)
  const checked = validateDraftScenario(draftScenario)
  if (!checked.validation.valid) throw new Error('Initial simulator scenario must be valid')
  const result = runDeterministicScenario(draftScenario)
  const analysis = createDefaultAnalysis(draftScenario)
  return {
    draftScenario, appliedScenario: structuredClone(draftScenario), pendingScenario: null,
    revision: 0, validatedRevision: 0, validationDelay: 0, ...checked,
    analysis, analysisValidation: validateAnalysis(draftScenario, analysis), ...result,
    monteCarlo: null, sensitivity: null, ...stoppedRun, stale: false,
  }
}

export function simulatorReducer(state: SimulatorState, action: SimulatorAction): SimulatorState {
  if (action.type === 'reset') return { ...action.state, revision: state.revision + 1, validatedRevision: state.revision + 1 }
  if (action.type === 'set-number') {
    const nullable = action.path === 'fans.dailyActionLimit' || action.path.endsWith('.dailyPurchaseLimit')
    return updateDraft(state, action.path, nullable && action.value === 0 ? null : action.value)
  }
  if (action.type === 'set-nullable-number' || action.type === 'set-boolean' || action.type === 'set-string' || action.type === 'set-string-array') {
    return updateDraft(state, action.path, action.value)
  }
  if (action.type === 'restore-formula') {
    return updateDraft(state, `battle.formulas.${action.formulaId}`, action.source === 'applied'
      ? state.appliedScenario.battle.formulas[action.formulaId] : DEFAULT_BATTLE_FORMULAS[action.formulaId])
  }
  if (action.type === 'validate-draft') {
    if (action.revision !== state.revision || state.validatedRevision === action.revision) return state
    const checked = validateDraftScenario(state.draftScenario)
    return {
      ...state, ...checked, validatedRevision: action.revision,
      pendingScenario: checked.validation.valid ? { revision: action.revision, scenario: structuredClone(state.draftScenario) } : null,
    }
  }
  if (action.type === 'set-analysis-number' || action.type === 'set-analysis-choice') {
    const analysis = writePath(state.analysis, action.path, action.value)
    return { ...state, ...stoppedRun, analysis, analysisValidation: validateAnalysis(state.draftScenario, analysis), sensitivity: null }
  }
  if (action.type === 'deterministic-result' || action.type === 'deterministic-error') {
    if (action.revision !== state.revision || state.pendingScenario?.revision !== action.revision) return state
    if (action.type === 'deterministic-result') {
      if (action.result.termination !== 'season-end') return state
      return {
        ...state, appliedScenario: structuredClone(state.pendingScenario.scenario),
        deterministic: action.result, calibration: action.calibration, pendingScenario: null,
        stale: false, errorMessage: null,
      }
    }
    const formula = normalizeFormulaError(action.error, 'deterministic')
    const message = formula?.message ?? '基准推演未完成，请检查参数或事件上限后重试。'
    return {
      ...state, pendingScenario: null, stale: true, runStatus: 'error', errorMessage: message,
      formulaErrors: formula ? { [formula.formulaId]: formula } : {},
      validation: { valid: false, issues: [{ path: formula ? `battle.formulas.${formula.formulaId}` : 'simulation', message }] },
    }
  }
  if (action.type === 'run-start') {
    if (state.stale) return state
    return { ...state, runStatus: 'running', progress: { completed: 0, total: 0 }, activeRunId: action.runId, errorMessage: null }
  }
  if (action.runId !== state.activeRunId) return state
  if (action.type === 'run-progress') return { ...state, progress: { completed: action.completed, total: action.total } }
  if (action.type === 'run-cancelling') return { ...state, runStatus: 'cancelling' }
  if (action.type === 'monte-carlo-result') return { ...state, ...stoppedRun, monteCarlo: action.result }
  if (action.type === 'sensitivity-result') return { ...state, ...stoppedRun, sensitivity: action.result }
  if (action.type === 'run-cancelled') return { ...state, ...stoppedRun }
  const formula = normalizeFormulaError(action.error, 'monte-carlo')
  return { ...state, ...stoppedRun, runStatus: 'error', errorMessage: formula?.message ?? '分析失败，请检查参数后重试。' }
}
