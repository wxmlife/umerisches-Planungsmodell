import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { SAMPLE_MONTE_CARLO_RESULT } from '../../test/fixtures'
import { createSimulatorState, simulatorReducer } from '../simulatorReducer'

describe('simulatorReducer', () => {
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
})
