import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { runTrials } from '../runner'

describe('Monte Carlo runner', () => {
  it('reproduces a seeded trial batch exactly', async () => {
    const first = await runTrials({ scenario: DEFAULT_SCENARIO, runs: 40, seed: 77 })
    const second = await runTrials({ scenario: DEFAULT_SCENARIO, runs: 40, seed: 77 })
    expect(second).toEqual(first)
  })

  it('orders P10, median, and P90 for every score point', async () => {
    const result = await runTrials({ scenario: DEFAULT_SCENARIO, runs: 80, seed: 88 })
    for (const guild of Object.values(result.guilds)) {
      for (const point of guild.scoreSeries) {
        expect(point.p10).toBeLessThanOrEqual(point.median)
        expect(point.median).toBeLessThanOrEqual(point.p90)
      }
    }
  })

  it('stops between trials when cancellation is requested', async () => {
    let completed = 0
    const result = await runTrials(
      { scenario: DEFAULT_SCENARIO, runs: 1000, seed: 99 },
      {
        isCancelled: () => completed >= 7,
        onProgress: (value) => { completed = value.completed },
      },
    )
    expect(result.cancelled).toBe(true)
    expect(completed).toBe(7)
  })

  it('does not mutate the scenario passed to repeated trials', async () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    const original = structuredClone(scenario)
    await runTrials({ scenario, runs: 2, seed: 1 })
    expect(scenario).toEqual(original)
  })
})
