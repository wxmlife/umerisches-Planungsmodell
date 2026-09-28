import type { BattleFormulaConfig } from './formula/types'
export type { BattleFormulaConfig } from './formula/types'

export type Tier = 'normal' | 'small' | 'whale'
export type NodeKind = 'normal' | 'core' | 'center'
export type CurrencyKind = 'usd' | 'diamond' | 'ad'

export type RewardResourceId = number

export interface RewardItem {
  resourceId: RewardResourceId
  quantity: number
  label?: string
  extra?: Record<string, number | string | null>
}

export interface RewardPersonalStage {
  points: number
  rewards: RewardItem[]
}

export interface RewardGuildMilestone {
  completionRate: number
  minimumPersonalRate: number
  rewards: RewardItem[]
}

export interface RewardRankConfig {
  rank: number
  merit: number
  titleId: number | null
  titleLabel: string
}

export interface RewardConfig {
  targetPoints: number
  dailyPointCap: number
  rankMinActiveDays: number
  rankMinProgressRate: number
  personalStages: RewardPersonalStage[]
  guildMilestones: RewardGuildMilestone[]
  rankRewards: RewardRankConfig[]
  legacyProgressThreshold: number
  legacyFreeMode: 'replace' | 'stack'
}

export interface LossBand {
  minRatio: number
  rate: number
}

export interface BattleConfig {
  formulas: BattleFormulaConfig
  baseIdolPower: number
  tierMultipliers: Record<Tier, number>
  alpha: number
  beta: number
  randomMin: number
  randomMax: number
  styleAdvantage: number
  calibrationStyle: 'neutral' | 'attacker-advantage' | 'attacker-disadvantage'
  homeLossFactor: number
  lossBands: LossBand[]
}

export interface FanConfig {
  capacity: number
  minDeploy: number
  maxDeploy: number
  naturalCapacityPerDay: number
  attackCooldownMinutes: number
  formationSlots: number
  dailyActionLimit: number | null
}

export interface ScoreConfig {
  attackWinBase: number
  attackLoss: number
  holdPerHourBase: number
  nodeMultipliers: Record<NodeKind, number>
  defenderPersonalWinBase: number
  defenderPersonalLoss: number
  defenderPersonalDailyCap: number
}

export interface RecoveryOffer {
  id: string
  label: string
  mode: 'program' | 'instant'
  usdCost: number
  diamondCost: number
  adCost: number
  immediateCapacityRate: number
  pulseCapacityRates: Array<{ afterMinutes: number; rate: number }>
  continuousCapacityRate: number
  durationMinutes: number
  fixedFans: number
  dailyPurchaseLimit: number | null
}

export interface TierPurchasePolicy {
  versionUsdBudget: number
  versionDiamondBudget: number
  versionAdBudget: number
  useAds: boolean
  supplyPriority: string[]
}

export interface SupplyConfig {
  offers: RecoveryOffer[]
  adDailyLimit: number
  diamondUsdRate: number | null
}

export interface GuildConfig {
  id: string
  name: string
  roster: Record<Tier, number>
  purchasePolicies: Record<Tier, TierPurchasePolicy>
  deployFans: Record<NodeKind, number>
  priorities: Record<NodeKind, number>
}

export interface Scenario {
  battle: BattleConfig
  fans: FanConfig
  score: ScoreConfig
  supply: SupplyConfig
  season: {
    days: number
    centerUnlockDay: number
    nodeCounts: Record<NodeKind, number>
  }
  guilds: GuildConfig[]
  rewards: RewardConfig
  simulation: { runs: number; seed: number; maxEventsPerDay: number }
}

export interface ValidationIssue {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}
