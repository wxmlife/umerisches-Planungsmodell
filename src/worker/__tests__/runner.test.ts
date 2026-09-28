import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { runTrials } from '../runner'
import { createPurchaseScenario } from '../../test/fixtures'
import type { WorkerRequest } from '../protocol'

describe('Monte Carlo runner', () => {
  it('preserves independent guild budgets through a cloned worker request and repeated trials', async () => {
    const scenario = createPurchaseScenario()
    scenario.guilds.push({ ...structuredClone(scenario.guilds[0]), id: 'B', name: 'B' })
    scenario.guilds[1].purchasePolicies.normal.versionUsdBudget = 0
    const request: WorkerRequest = { type: 'run', runId: 'version-budgets', scenario, runs: 2, seed: 1 }
    const cloned = structuredClone(request)
    const result = await runTrials(cloned)
    expect(result.guilds.A.spend.usd).toEqual({ p10: 6, median: 6, p90: 6, mean: 6 })
    expect(result.guilds.B.spend.usd).toEqual({ p10: 0, median: 0, p90: 0, mean: 0 })
    expect(cloned).toEqual(request)
  })
  it('reproduces a seeded trial batch exactly', async () => {
    const first = await runTrials({ scenario: DEFAULT_SCENARIO, runs: 40, seed: 77 })
    const second = await runTrials({ scenario: DEFAULT_SCENARIO, runs: 40, seed: 77 })
    expect(second).toEqual(first)
  }, 20_000)

  it('orders P10, median, and P90 for every score point', async () => {
    const result = await runTrials({ scenario: DEFAULT_SCENARIO, runs: 80, seed: 88 })
    for (const guild of Object.values(result.guilds)) {
      for (const point of guild.scoreSeries) {
        expect(point.p10).toBeLessThanOrEqual(point.median)
        expect(point.median).toBeLessThanOrEqual(point.p90)
      }
    }
  }, 20_000)

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

  it('rejects an event-limited season instead of aggregating a truncated result', async () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.simulation.maxEventsPerDay = 100

    await expect(runTrials({ scenario, runs: 1, seed: 1 })).rejects.toThrow(
      /单日最大事件数|event limit/i,
    )
  })
})
