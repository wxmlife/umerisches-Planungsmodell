import { aggregateTrials, type MonteCarloResult } from '../domain/aggregate'
import { createBattleRuntime, type BattleRuntime } from '../domain/battle'
import { createSeededRng } from '../domain/rng'
import { runSeason, type SeasonResult } from '../domain/season'
import type { Scenario } from '../domain/types'

export interface TrialRequest {
  scenario: Scenario
  runs: number
  seed: number
}

export interface TrialProgress {
  completed: number
  total: number
}

export interface TrialHooks {
  isCancelled?: () => boolean
  onProgress?: (progress: TrialProgress) => void
}

export function eventLimitMessage(
  scenario: Scenario,
  result: SeasonResult,
): string {
  const minute = result.terminationMinute ?? 0
  const day = Math.min(scenario.season.days, Math.floor(minute / 1440) + 1)
  return `第 ${day} 日 ${minute} 分钟触发单日最大事件数 ${scenario.simulation.maxEventsPerDay}`
}

function mixSeed(seed: number, trialIndex: number): number {
  let mixed = (seed ^ Math.imul(trialIndex + 1, 0x9e3779b1)) >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x85ebca6b)
  mixed ^= mixed >>> 13
  mixed = Math.imul(mixed, 0xc2b2ae35)
  return (mixed ^ (mixed >>> 16)) >>> 0
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function runTrials(
  request: TrialRequest,
  hooks: TrialHooks = {},
  runtime: BattleRuntime = createBattleRuntime(request.scenario.battle, 'monte-carlo'),
): Promise<MonteCarloResult> {
  const results: SeasonResult[] = []
  let cancelled = false

  for (let index = 0; index < request.runs; index += 1) {
    if (hooks.isCancelled?.()) {
      cancelled = true
      break
    }
    const season = runSeason(
      request.scenario,
      createSeededRng(mixSeed(request.seed, index)),
      'stochastic',
      runtime,
    )
    if (season.termination === 'event-limit') {
      throw new Error(eventLimitMessage(request.scenario, season))
    }
    results.push(season)
    hooks.onProgress?.({ completed: index + 1, total: request.runs })
    if ((index + 1) % 10 === 0) await yieldToEventLoop()
  }

  if (results.length < request.runs && hooks.isCancelled?.()) cancelled = true
  const aggregate = aggregateTrials(results)
  return {
    ...aggregate,
    runsRequested: request.runs,
    runsCompleted: results.length,
    cancelled,
  }
}
