import type { MonteCarloResult, QuantilePoint, Quantiles } from '../domain/aggregate'
import type { SpendEvent } from '../domain/economy'
import { DEFAULT_SCENARIO } from '../domain/defaults'
import type { Scenario, TierPurchasePolicy } from '../domain/types'

// Two players and one occupied high-value node versus a neutral low-value node.
export function createFormulaScenario(): Scenario {
  const scenario = structuredClone(DEFAULT_SCENARIO)
  scenario.season = { days: 1, centerUnlockDay: 1, nodeCounts: { normal: 1, core: 1, center: 0 } }
  scenario.fans = { ...scenario.fans, capacity: 1000, minDeploy: 1000, maxDeploy: 1000, naturalCapacityPerDay: 0 }
  scenario.guilds = scenario.guilds.slice(0, 2)
  for (const guild of scenario.guilds) {
    guild.roster = { normal: 1, small: 0, whale: 0 }
    guild.deployFans = { normal: 1000, core: 1000, center: 1000 }
    guild.priorities = { normal: 1, core: 1, center: 0 }
    for (const policy of Object.values(guild.purchasePolicies)) policy.supplyPriority = []
  }
  scenario.guilds[0].priorities.normal = 0
  return scenario
}

// One player can repeatedly deploy onto neutral nodes, isolating purchases from battles.
export function createPurchaseScenario(policy: Partial<TierPurchasePolicy> = {}): Scenario {
  const scenario = structuredClone(DEFAULT_SCENARIO)
  scenario.fans = { ...scenario.fans, capacity: 1000, minDeploy: 1000, maxDeploy: 1000, naturalCapacityPerDay: 0, attackCooldownMinutes: 0 }
  scenario.season.nodeCounts = { normal: 100, core: 0, center: 0 }
  scenario.supply.offers = [{
    id: 'test-supply', label: 'Test supply', mode: 'instant', usdCost: 1,
    diamondCost: 0, adCost: 0, immediateCapacityRate: 0,
    pulseCapacityRates: [], continuousCapacityRate: 0, durationMinutes: 0,
    fixedFans: 1000, dailyPurchaseLimit: null,
  }]
  scenario.guilds = [scenario.guilds[0]]
  for (const guild of scenario.guilds) {
    guild.roster = { normal: 1, small: 0, whale: 0 }
    guild.deployFans = { normal: 1000, core: 1000, center: 1000 }
    guild.purchasePolicies = Object.fromEntries(['normal', 'small', 'whale'].map((tier) => [tier, {
      versionUsdBudget: 6, versionDiamondBudget: 0, versionAdBudget: 0,
      useAds: false, supplyPriority: ['test-supply'], ...structuredClone(policy),
    }])) as Scenario['guilds'][number]['purchasePolicies']
  }
  return scenario
}

const zero: Quantiles = { p10: 0, median: 0, p90: 0, mean: 0 }
const zeroPoint: QuantilePoint = { minute: 0, ...zero }
const scorePoint: QuantilePoint = {
  minute: 0,
  p10: 10,
  median: 20,
  p90: 30,
  mean: 20,
}

export const SAMPLE_MONTE_CARLO_RESULT: MonteCarloResult = {
  guilds: {
    A: {
      scoreSeries: [scorePoint],
      attackScoreSeries: [zeroPoint],
      holdingScoreSeries: [zeroPoint],
      nodeSeries: {
        normal: [zeroPoint],
        core: [zeroPoint],
        center: [zeroPoint],
      },
      availableFanSeries: [zeroPoint],
      garrisonFanSeries: [zeroPoint],
      lostFanSeries: [zeroPoint],
      finalScore: scorePoint,
      rankProbabilities: { 1: 1 },
      actionCapacityBlocks: { formation: zero, cooldown: zero },
      spend: { usd: zero, diamonds: zero, ads: zero },
      supplyBySource: {},
    },
  },
  runsRequested: 3,
  runsCompleted: 3,
  cancelled: false,
}

export const SAMPLE_SPEND_EVENTS: SpendEvent[] = [
  { minute: 0, guildId: 'A', playerId: 'A-whale-1', tier: 'whale', offerId: 'flyer', usd: 0.99, diamonds: 0, ads: 0 },
  { minute: 60, guildId: 'A', playerId: 'A-whale-1', tier: 'whale', offerId: 'cheer-stick', usd: 2.99, diamonds: 0, ads: 0 },
  { minute: 100, guildId: 'A', playerId: 'A-normal-1', tier: 'normal', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
  { minute: 1440, guildId: 'B', playerId: 'B-small-1', tier: 'small', offerId: 'instant-600', usd: 2.99, diamonds: 0, ads: 0 },
  { minute: 1500, guildId: 'B', playerId: 'B-small-1', tier: 'small', offerId: 'ad-or-diamond-diamond', usd: 0, diamonds: 20, ads: 0 },
  { minute: 1600, guildId: 'B', playerId: 'B-small-1', tier: 'small', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
  { minute: 2880, guildId: 'C', playerId: 'C-normal-1', tier: 'normal', offerId: 'instant-1000', usd: 5.99, diamonds: 0, ads: 0 },
  { minute: 2900, guildId: 'C', playerId: 'C-normal-1', tier: 'normal', offerId: 'ad-or-diamond-diamond', usd: 0, diamonds: 20, ads: 0 },
  { minute: 3000, guildId: 'C', playerId: 'C-normal-1', tier: 'normal', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
  { minute: 4320, guildId: 'D', playerId: 'D-normal-1', tier: 'normal', offerId: 'ad-or-diamond-diamond', usd: 0, diamonds: 20, ads: 0 },
  { minute: 4400, guildId: 'D', playerId: 'D-normal-1', tier: 'normal', offerId: 'ad-or-diamond-ad', usd: 0, diamonds: 0, ads: 1 },
]
