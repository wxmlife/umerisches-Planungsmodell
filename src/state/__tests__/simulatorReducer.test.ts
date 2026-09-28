import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { runSeason } from '../../domain/season'
import { createSeededRng } from '../../domain/rng'
import { SAMPLE_MONTE_CARLO_RESULT } from '../../test/fixtures'
import { createSimulatorState, simulatorReducer } from '../simulatorReducer'

describe('simulatorReducer', () => {
  it.each([1, 14])('keeps the six-day ledger snapshot during a pending %i-day edit and rejects late results', days => {
    const initial = createSimulatorState(DEFAULT_SCENARIO)
    const openCenter = simulatorReducer(initial, { type: 'set-number', path: 'season.centerUnlockDay', value: 1 })
    const edited = simulatorReducer(openCenter, { type: 'set-number', path: 'season.days', value: days })
    expect(edited.deterministicScenario.season.days).toBe(6)
    expect(edited.deterministic).toBe(initial.deterministic)
    const late = simulatorReducer(edited, { type: 'deterministic-result', scenario: openCenter.lastValidScenario, result: initial.deterministic })
    expect(late.deterministicScenario.season.days).toBe(6)
    const applied = simulatorReducer(edited, { type: 'deterministic-result', scenario: edited.lastValidScenario, result: runSeason(edited.lastValidScenario, createSeededRng(1), 'deterministic') })
    expect(applied.deterministicScenario.season.days).toBe(days)
    expect(applied.deterministicScenario).not.toBe(applied.lastValidScenario)
  })
  it('invalidates stochastic output and ignores a late worker result after a valid edit', () => {
    const initial = {
      ...createSimulatorState(DEFAULT_SCENARIO),
      monteCarlo: SAMPLE_MONTE_CARLO_RESULT,
    }
    const running = simulatorReducer(initial, { type: 'run-start', runId: 'old-run' })
    const edited = simulatorReducer(running, {
      type: 'set-number',
      path: 'fans.capacity',
      value: 4000,
    })

    expect(edited.monteCarlo).toBeNull()
    expect(edited.runStatus).toBe('idle')
    expect(edited.activeRunId).toBeNull()

    const afterLateResult = simulatorReducer(edited, {
      type: 'monte-carlo-result',
      runId: 'old-run',
      result: SAMPLE_MONTE_CARLO_RESULT,
    })
    expect(afterLateResult.monteCarlo).toBeNull()
  })

  it('retains the last stochastic output while an invalid draft is shown stale', () => {
    const initial = {
      ...createSimulatorState(DEFAULT_SCENARIO),
      monteCarlo: SAMPLE_MONTE_CARLO_RESULT,
    }
    const edited = simulatorReducer(initial, {
      type: 'set-number',
      path: 'fans.capacity',
      value: 50,
    })

    expect(edited.validation.valid).toBe(false)
    expect(edited.monteCarlo).toBe(SAMPLE_MONTE_CARLO_RESULT)
    expect(edited.stale).toBe(true)
  })

  it('invalidates an active sensitivity run when its target changes', () => {
    const running = simulatorReducer(
      createSimulatorState(DEFAULT_SCENARIO),
      { type: 'run-start', runId: 'old-sensitivity' },
    )
    const edited = simulatorReducer(running, {
      type: 'set-analysis-choice',
      path: 'targetGuildId',
      value: 'B',
    })

    expect(edited.activeRunId).toBeNull()
    expect(edited.runStatus).toBe('idle')

    const afterLateResult = simulatorReducer(edited, {
      type: 'sensitivity-result',
      runId: 'old-sensitivity',
      result: {
        request: {
          parameter: 'battle.alpha',
          metric: 'finalScoreGap',
          min: 1,
          max: 1,
          step: 1,
          targetGuildId: 'A',
          runs: 1,
          seed: 1,
        },
        points: [],
        cancelled: false,
      },
    })
    expect(afterLateResult.sensitivity).toBeNull()
  })
})
