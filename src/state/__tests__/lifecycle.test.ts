import { describe, expect, it } from 'vitest'
import { DEFAULT_BATTLE_FORMULAS } from '../../domain/defaults'
import { createFormulaScenario, SAMPLE_MONTE_CARLO_RESULT } from '../../test/fixtures'
import { createSimulatorState, simulatorReducer } from '../simulatorReducer'

describe('three-stage simulator lifecycle', () => {
  it('keeps applied and result snapshots until the newest pending revision fully succeeds', () => {
    const initial = createSimulatorState(createFormulaScenario())
    const edit = simulatorReducer(initial, { type: 'set-number', path: 'battle.alpha', value: 2 })
    expect(edit.appliedScenario).toEqual(initial.appliedScenario)
    expect(edit.deterministic).toBe(initial.deterministic)
    expect(edit.revision).toBe(1)
    const pending = simulatorReducer(edit, { type: 'validate-draft', revision: 1 })
    expect(pending.pendingScenario?.scenario.battle.alpha).toBe(2)
    expect(pending.pendingScenario?.scenario).not.toBe(pending.draftScenario)
    expect(pending.pendingScenario?.scenario.battle).not.toBe(pending.draftScenario.battle)
    const next = simulatorReducer(pending, { type: 'set-number', path: 'battle.beta', value: 3 })
    expect(simulatorReducer(next, { type: 'validate-draft', revision: 1 })).toBe(next)
    expect(simulatorReducer(next, { type: 'deterministic-result', revision: 1, result: initial.deterministic, calibration: initial.calibration })).toBe(next)
    const latest = simulatorReducer(next, { type: 'validate-draft', revision: 2 })
    const applied = simulatorReducer(latest, { type: 'deterministic-result', revision: 2, result: initial.deterministic, calibration: initial.calibration })
    expect(applied.appliedScenario.battle).toMatchObject({ alpha: 2, beta: 3 })
    expect(applied.appliedScenario).not.toBe(applied.draftScenario)
    expect(applied.pendingScenario).toBeNull()
    expect(applied.stale).toBe(false)
  })

  it('preserves applied on runtime failure and clears analyses on every edit', () => {
    const initial = { ...createSimulatorState(createFormulaScenario()), monteCarlo: SAMPLE_MONTE_CARLO_RESULT }
    const running = simulatorReducer(initial, { type: 'run-start', runId: 'old' })
    const edited = simulatorReducer(running, { type: 'set-string', path: 'battle.formulas.winProbability', value: '1 / 0' })
    expect(edited.monteCarlo).toBeNull()
    expect(edited.activeRunId).toBeNull()
    const pending = simulatorReducer(edited, { type: 'validate-draft', revision: edited.revision })
    expect(pending.pendingScenario).not.toBeNull()
    const failed = simulatorReducer(pending, { type: 'deterministic-error', revision: edited.revision, error: { kind: 'formula', formulaId: 'winProbability', phase: 'runtime', code: 'DIVIDE_BY_ZERO', message: 'secret stack' } })
    expect(failed.appliedScenario).toBe(initial.appliedScenario)
    expect(failed.draftScenario.battle.formulas.winProbability).toBe('1 / 0')
    expect(failed.pendingScenario).toBeNull()
    expect(failed.formulaErrors.winProbability?.message).toBe('公式不能除以零或对零取余。')
    expect(failed.errorMessage).not.toContain('secret')
    expect(simulatorReducer(failed, { type: 'monte-carlo-result', runId: 'old', result: SAMPLE_MONTE_CARLO_RESULT })).toBe(failed)
  })

  it('keeps applied and deterministic results after an analysis failure', () => {
    const initial = createSimulatorState(createFormulaScenario())
    const running = simulatorReducer(initial, { type: 'run-start', runId: 'analysis' })
    const failed = simulatorReducer(running, { type: 'run-error', runId: 'analysis', error: new Error('private stack') })
    expect(failed.appliedScenario).toBe(initial.appliedScenario)
    expect(failed.deterministic).toBe(initial.deterministic)
    expect(failed.stale).toBe(false)
    expect(failed.errorMessage).toBe('分析失败，请检查参数后重试。')
  })

  it('reports static errors and restores only the selected formula field', () => {
    const scenario = createFormulaScenario()
    scenario.battle.formulas.fanLoss = '0'
    const initial = createSimulatorState(scenario)
    let edited = simulatorReducer(initial, { type: 'set-string', path: 'battle.formulas.fanLoss', value: 'window.x' })
    edited = simulatorReducer(edited, { type: 'set-number', path: 'battle.alpha', value: 2 })
    const invalid = simulatorReducer(edited, { type: 'validate-draft', revision: edited.revision })
    expect(invalid.validation.valid).toBe(false)
    expect(invalid.formulaErrors.fanLoss?.range).toBeDefined()
    expect(invalid.pendingScenario).toBeNull()
    const previous = simulatorReducer(invalid, { type: 'restore-formula', formulaId: 'fanLoss', source: 'applied' })
    expect(previous.draftScenario.battle.formulas.fanLoss).toBe('0')
    expect(previous.draftScenario.battle.alpha).toBe(2)
    const defaults = simulatorReducer(previous, { type: 'restore-formula', formulaId: 'fanLoss', source: 'default' })
    expect(defaults.draftScenario.battle.formulas.fanLoss).toBe(DEFAULT_BATTLE_FORMULAS.fanLoss)
    expect(defaults.draftScenario.battle.formulas.winProbability).toBe(initial.appliedScenario.battle.formulas.winProbability)
  })
  it('contains analysis validation errors when an edited loss table has no close-loss scan band', () => {
    const initial = createSimulatorState(createFormulaScenario())
    const edited = simulatorReducer(initial, { type: 'set-number', path: 'battle.lossBands.3.minRatio', value: 0.6 })
    expect(() => simulatorReducer(edited, { type: 'set-analysis-choice', path: 'sensitivityParameter', value: 'battle.closeLossRate' })).not.toThrow()
    const selected = simulatorReducer(edited, { type: 'set-analysis-choice', path: 'sensitivityParameter', value: 'battle.closeLossRate' })
    expect(selected.analysisValidation.valid).toBe(false)
    expect(selected.appliedScenario).toBe(initial.appliedScenario)
    expect(selected.draftScenario.battle.lossBands[3].minRatio).toBe(0.6)
  })
})
