import { describe, expect, it, vi } from 'vitest'
import * as compiler from '../../domain/formula/compiler'
import { normalizeFormulaError } from '../../domain/formula/types'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { runTrials } from '../runner'
import { createFormulaScenario, createPurchaseScenario } from '../../test/fixtures'
import type { WorkerRequest, WorkerResponse } from '../protocol'

it('transports reward Monte Carlo distributions separately from deterministic settlements', async () => {
  const scenario = createFormulaScenario()
  scenario.rewards.personalStages[0].points = 100
  const request: WorkerRequest = { type: 'run', runId: 'reward-trials', scenario, runs: 3, seed: 3 }
  const result = await runTrials(structuredClone(request))
  expect(result.rewards).toMatchObject({ mode: 'monte-carlo', runs: 3 })
  expect(result.rewards?.issuance[90].mean).toBeGreaterThan(0)
  expect(result.rewards).not.toHaveProperty('players')
  expect(structuredClone(result)).toEqual(result)
})

describe('Worker error transport', () => {
  it('reconstructs only safe whitelisted DTO fields and rejects forged error shapes', () => {
    const error = {
      kind: 'formula', formulaId: 'fanLoss', phase: 'runtime', code: 'DIVIDE_BY_ZERO',
      message: 'private source and stack', source: 'secret', stack: 'secret',
      range: { start: 1, end: 6, internal: () => 'secret' },
      variables: { currentFans: 1000, sideLossFactor: Infinity, attackerWon: true, isDefender: 1, secret: 'secret' },
    }
    const dto = normalizeFormulaError(error, 'sensitivity')
    expect(dto).toEqual({ kind: 'formula', formulaId: 'fanLoss', phase: 'runtime', code: 'DIVIDE_BY_ZERO',
      message: '公式不能除以零或对零取余。', context: 'sensitivity', range: { start: 1, end: 6 },
      variables: { currentFans: 1000, attackerWon: true },
    })
    expect(structuredClone(dto)).toEqual(dto)
    expect(normalizeFormulaError({ ...error, phase: { toString: () => 'runtime' } }, 'monte-carlo')).toBeUndefined()
    expect(normalizeFormulaError({ ...error, code: 'INTERNAL' }, 'monte-carlo')).toBeUndefined()
  })
  it('posts formula DTOs with analysis context and sanitizes unknown failures', async () => {
    let receive!: (event: MessageEvent<WorkerRequest>) => Promise<void>
    const responses: WorkerResponse[] = []
    vi.stubGlobal('self', {
      addEventListener: (_type: string, listener: typeof receive) => { receive = listener },
      postMessage: (response: WorkerResponse) => { responses.push(structuredClone(response)) },
    })
    try {
      await import('../monteCarlo.worker')
      for (const type of ['run', 'sensitivity'] as const) {
        const scenario = createFormulaScenario()
        scenario.battle.formulas = { ...scenario.battle.formulas, preRandomPower: '1 / 0' }
        const request: WorkerRequest = type === 'run'
          ? { type, runId: type, scenario, runs: 1, seed: 11 }
          : { type, runId: type, scenario, request: {
              parameter: 'battle.beta', metric: 'battleThreeWinProbability', min: 1, max: 1, step: 1,
              targetGuildId: 'B', runs: 1, seed: 11,
            } }
        await receive({ data: request } as MessageEvent<WorkerRequest>)
        expect(responses.at(-1)).toMatchObject({ type: 'error', runId: type,
          error: { kind: 'formula', formulaId: 'preRandomPower', code: 'DIVIDE_BY_ZERO', context: type === 'run' ? 'monte-carlo' : 'sensitivity' },
        })
        expect(JSON.stringify(responses.at(-1))).not.toMatch(/stack|source|\[object Object\]/)
      }
      const scenario = createFormulaScenario()
      scenario.simulation.maxEventsPerDay = 0
      await receive({ data: { type: 'run', runId: 'unknown', scenario, runs: 1, seed: 11 } } as MessageEvent<WorkerRequest>)
      expect(responses.at(-1)).toEqual({ type: 'error', runId: 'unknown', message: '分析失败，请检查参数后重试。' })
    } finally { vi.unstubAllGlobals() }
  })
})

describe('Monte Carlo runner', () => {
  it.each([0, 1])('uses constant probability %s in a cloned batch and compiles only once', async (probability) => {
    const scenario = createFormulaScenario()
    scenario.season.nodeCounts = { normal: 0, core: 1, center: 0 }
    scenario.battle.formulas = { ...scenario.battle.formulas, winProbability: String(probability), fanLoss: 'currentFans' }
    const compile = vi.spyOn(compiler, 'compileFormula')
    try {
      const result = await runTrials(structuredClone({ scenario, runs: 4, seed: 11 }))
      const totalAttackScore = Object.values(result.guilds).reduce((sum, guild) => sum + guild.attackScoreSeries.at(-1)!.mean, 0)
      expect(totalAttackScore).toBe(probability === 0 ? 3 : 20)
      expect(compile.mock.calls.map(([id]) => id).sort()).toEqual(['displayedTendency', 'fanLoss', 'preRandomPower', 'winProbability'])
    } finally { compile.mockRestore() }
  })

  it.each(['currentFans', '1 / 0'])('rejects %s with a clone-safe Monte Carlo formula error', async (winProbability) => {
    const scenario = createFormulaScenario()
    scenario.season.nodeCounts = { normal: 0, core: 1, center: 0 }
    scenario.battle.formulas = { ...scenario.battle.formulas, winProbability }
    const result = await runTrials({ scenario, runs: 1, seed: 11 }).then(() => null, (error: unknown) => error)
    expect(result).toMatchObject({ kind: 'formula', formulaId: 'winProbability', context: 'monte-carlo' })
    expect(structuredClone(result)).toEqual(result)
    expect(result).not.toBeInstanceOf(Error)
    expect(result).not.toHaveProperty('stack')
  })
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
