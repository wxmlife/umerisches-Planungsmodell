import { DEFAULT_REWARD_CONFIG } from './defaults'
import type { SeasonEvent, SeasonResult, SeasonRosterEntry } from './season'
import type {
  RewardConfig,
  RewardItem,
  RewardRankConfig,
  RewardResourceId,
  Scenario,
  Tier,
} from './types'

export interface RewardPlayerResult {
  playerId: string
  guildId: string
  tier: Tier
  points: number
  dailyPoints: number[]
  activeDays: number
  defenseActiveDays: number
  personalStagesUnlocked: number
  rankEligible: boolean
  personalRewards: Record<RewardResourceId, number>
  guildRewards: Record<RewardResourceId, number>
  rankRewards: Record<RewardResourceId, number>
  title: RewardItem | null
  totalRewards: Record<RewardResourceId, number>
}

export interface RewardGuildResult {
  guildId: string
  memberCount: number
  completionRate: number
  milestonesUnlocked: number
  milestoneAchievementRates: number[]
  rank: number
  occupiedRanks: number[]
  rankMerit: number
}

export interface LegacyRewardAuditInput {
  freePassClaims: number
  paidPassClaims: number
  iapPurchases: Array<{ itemId: number; purchases: number; effectiveMembers: number }>
  redPocket?: {
    perPlayerClaims: RewardItem[]
    allSeatClaims: RewardItem[]
    claimSeats: number
  }
  shop?: {
    finiteMeritCost: number
    finiteInventory: Array<{ resourceId: number; label: string; quantity: number }>
    unlimitedExchanges: Array<{ meritCost: number; output: RewardItem }>
  }
}

export interface LegacyRewardAuditResult {
  freePass: { issuance: Record<RewardResourceId, number>; settlementTiming: 'season-end' }
  paidPass: { issuance: Record<RewardResourceId, number>; settlementTiming: 'season-end' }
  redPocket: {
    basis: 'lifetime-once'
    perPlayerTheoretical: Record<RewardResourceId, number>
    allSeatCap: Record<RewardResourceId, number>
    claimSeats: number
  }
  shop: {
    basis: 'exchange-not-free-issuance'
    finiteMeritCost: number
    finiteInventory: Array<{ resourceId: number; label: string; quantity: number }>
    unlimitedExchanges: Array<{ meritCost: number; output: RewardItem }>
  }
  iapAllMember: {
    issuance: Record<RewardResourceId, number>
    purchases: Array<{ itemId: number; purchases: number; effectiveMembers: number; issuance: Record<RewardResourceId, number> }>
  }
}

export interface RewardModelAudit {
  legacyProgressThreshold: number
  targetPoints: number
  legacyFreePerPlayer: Record<RewardResourceId, number>
  replacementMode: RewardConfig['legacyFreeMode']
}

export interface RewardModelResult {
  mode: 'deterministic' | 'stochastic'
  settlementTiming: 'season-end'
  players: RewardPlayerResult[]
  guilds: Record<string, RewardGuildResult>
  issuance: Record<RewardResourceId, number>
  sources: {
    personal: Record<RewardResourceId, number>
    guild: Record<RewardResourceId, number>
    rank: Record<RewardResourceId, number>
    titles: Record<RewardResourceId, number>
    legacyFree: Record<RewardResourceId, number>
  }
  completionRate: number
  eligibleCount: number
  legacyFreeDelta: Record<RewardResourceId, number>
  audit: RewardModelAudit
  tiers: Record<Tier, { averageRewards: Record<RewardResourceId, RewardQuantiles> }>
}

export interface RewardQuantiles {
  p10: number
  median: number
  p90: number
  mean: number
}

export interface RewardDistribution {
  mode: 'monte-carlo'
  runs: number
  completionRate: RewardQuantiles
  eligibleCount: RewardQuantiles
  issuance: Record<RewardResourceId, RewardQuantiles>
  guilds: Record<string, { milestoneAchievementRates: RewardQuantiles[] }>
  tiers: Record<Tier, { averageRewards: Record<RewardResourceId, RewardQuantiles> }>
}

const FREE_PASS: Record<RewardResourceId, number> = { 2: 240, 90: 260, 91: 100, 5: 110 }
const PAID_PASS: Record<RewardResourceId, number> = { 2: 1300, 3: 220000, 5: 250, 10: 5, 63: 110, 64: 35, 92: 10 }
const IAP_REWARDS: Record<number, RewardItem[]> = {
  2202: [{ resourceId: 92, quantity: 1 }],
  2203: [{ resourceId: 92, quantity: 2 }],
  2204: [{ resourceId: 64, quantity: 1 }],
  2205: [{ resourceId: 19, quantity: 1 }],
  2206: [{ resourceId: 140, quantity: 1 }],
}
const TIERS: Tier[] = ['normal', 'small', 'whale']

function addResource(target: Record<number, number>, resourceId: number, quantity: number) {
  if (quantity === 0) return
  target[resourceId] = (target[resourceId] ?? 0) + quantity
}

function addItems(target: Record<number, number>, items: RewardItem[]) {
  for (const item of items) addResource(target, item.resourceId, item.quantity)
}

function cloneItems(items: RewardItem[]): RewardItem[] {
  return items.map((item) => ({ ...item, extra: item.extra ? { ...item.extra } : undefined }))
}

function sumMaps(...maps: Array<Record<number, number>>): Record<number, number> {
  const result: Record<number, number> = {}
  for (const map of maps) for (const [key, value] of Object.entries(map)) addResource(result, Number(key), value)
  return result
}

function rateQuantiles(values: number[]): RewardQuantiles {
  if (values.length === 0) return { p10: 0, median: 0, p90: 0, mean: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p: number) => {
    const position = (sorted.length - 1) * p
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    if (lower === upper) return sorted[lower]
    const fraction = position - lower
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction
  }
  return {
    p10: percentile(0.1), median: percentile(0.5), p90: percentile(0.9),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}

function legacyAuditDefaults(input: LegacyRewardAuditInput): Required<LegacyRewardAuditInput> {
  return {
    ...input,
    redPocket: input.redPocket ?? {
      perPlayerClaims: [{ resourceId: 2, quantity: 5480 }],
      allSeatClaims: [{ resourceId: 2, quantity: 102400 }],
      claimSeats: 1165,
    },
    shop: input.shop ?? {
      finiteMeritCost: 137700,
      finiteInventory: [],
      unlimitedExchanges: [
        { meritCost: 300, output: { resourceId: 0, quantity: 10, label: '滚刷券' } },
        { meritCost: 3000, output: { resourceId: 92, quantity: 2, label: '联盟能量饮料' } },
        { meritCost: 200, output: { resourceId: 3, quantity: 2000, label: '金币' } },
      ],
    },
  }
}

export function calculateLegacyRewardAudit(input: LegacyRewardAuditInput): LegacyRewardAuditResult {
  if (!Number.isInteger(input.freePassClaims) || input.freePassClaims < 0 || !Number.isInteger(input.paidPassClaims) || input.paidPassClaims < 0) {
    throw new Error('战令领取次数必须是非负整数')
  }
  const normalized = legacyAuditDefaults(input)
  const freePass: Record<number, number> = {}
  const paidPass: Record<number, number> = {}
  for (const [resourceId, quantity] of Object.entries(FREE_PASS)) freePass[Number(resourceId)] = quantity * input.freePassClaims
  for (const [resourceId, quantity] of Object.entries(PAID_PASS)) paidPass[Number(resourceId)] = quantity * input.paidPassClaims
  const perPlayerTheoretical: Record<number, number> = {}
  const allSeatCap: Record<number, number> = {}
  addItems(perPlayerTheoretical, normalized.redPocket.perPlayerClaims)
  addItems(allSeatCap, normalized.redPocket.allSeatClaims)
  const iapIssuance: Record<number, number> = {}
  const iapPurchases = normalized.iapPurchases.map((purchase) => {
    if (!Number.isInteger(purchase.purchases) || purchase.purchases < 0 || !Number.isInteger(purchase.effectiveMembers) || purchase.effectiveMembers < 0) throw new Error('IAP 次数和有效成员数必须是非负整数')
    const issuance: Record<number, number> = {}
    for (const item of IAP_REWARDS[purchase.itemId] ?? []) {
      const quantity = item.quantity * purchase.purchases * purchase.effectiveMembers
      addResource(issuance, item.resourceId, quantity)
      addResource(iapIssuance, item.resourceId, quantity)
    }
    return { ...purchase, issuance }
  })
  return {
    freePass: { issuance: freePass, settlementTiming: 'season-end' },
    paidPass: { issuance: paidPass, settlementTiming: 'season-end' },
    redPocket: { basis: 'lifetime-once', perPlayerTheoretical, allSeatCap, claimSeats: normalized.redPocket.claimSeats },
    shop: { basis: 'exchange-not-free-issuance', finiteMeritCost: normalized.shop.finiteMeritCost, finiteInventory: normalized.shop.finiteInventory, unlimitedExchanges: normalized.shop.unlimitedExchanges },
    iapAllMember: { issuance: iapIssuance, purchases: iapPurchases },
  }
}

function rosterFromScenario(scenario: Scenario): SeasonRosterEntry[] {
  return scenario.guilds.flatMap((guild) => TIERS.flatMap((tier) => Array.from({ length: guild.roster[tier] }, (_, index) => ({ playerId: `${guild.id}-${tier}-${index + 1}`, guildId: guild.id, tier }))))
}

function battlePoints(event: SeasonEvent): number {
  if (event.type !== 'battle' || !event.nodeKind) return 0
  const values: Record<Exclude<SeasonEvent['nodeKind'], undefined>, [number, number]> = {
    normal: [100, 500], core: [150, 800], center: [200, 3000],
  }
  return values[event.nodeKind][event.attackerWon ? 1 : 0]
}

function rankConfig(config: RewardConfig, rank: number): RewardRankConfig {
  const sorted = [...config.rankRewards].sort((a, b) => a.rank - b.rank)
  return sorted.find((item) => item.rank === rank) ?? sorted.at(-1) ?? { rank, merit: 0, titleId: null, titleLabel: '待配置聊天称号' }
}

function calculateRankGroups(scores: Record<string, number>) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const result = new Map<string, { rank: number; occupiedRanks: number[] }>()
  let start = 0
  while (start < sorted.length) {
    let end = start + 1
    while (end < sorted.length && Math.abs(sorted[end][1] - sorted[start][1]) <= 1e-9) end += 1
    const occupiedRanks = Array.from({ length: end - start }, (_, index) => start + index + 1)
    for (let index = start; index < end; index += 1) result.set(sorted[index][0], { rank: start + 1, occupiedRanks })
    start = end
  }
  return result
}

function halfUp(value: number): number {
  return Math.floor(value + 0.5)
}

export function calculateRewardModel(scenario: Scenario, season: SeasonResult): RewardModelResult {
  if (season.termination === 'event-limit') throw new Error('赛季未完成，不能结算奖励')
  const config = scenario.rewards ?? DEFAULT_REWARD_CONFIG
  const roster = season.seasonStartRoster?.length ? structuredClone(season.seasonStartRoster) : rosterFromScenario(scenario)
  const days = Math.max(scenario.season.days, season.events.reduce((max, event) => Math.max(max, event.day), 0), 1)
  const progress = new Map<string, { daily: number[]; active: Set<number>; defense: Set<number>; eventIds: Set<string> }>()
  for (const player of roster) progress.set(player.playerId, { daily: Array(days).fill(0), active: new Set(), defense: new Set(), eventIds: new Set() })
  for (const event of season.events) {
    const id = event.id ?? `${event.type}:${event.minute}:${event.playerId ?? ''}:${event.nodeId ?? ''}`
    if (event.playerId) {
      const entry = progress.get(event.playerId)
      if (entry && !entry.eventIds.has(id)) {
        entry.eventIds.add(id)
        const amount = battlePoints(event)
        if (amount > 0) {
          const index = Math.max(0, Math.min(days - 1, event.day - 1))
          entry.daily[index] += amount
          entry.active.add(index + 1)
        }
      }
    }
    if (event.defenderPlayerId && event.defenseContribution !== undefined) {
      const entry = progress.get(event.defenderPlayerId)
      if (entry) entry.defense.add(Math.max(1, event.day))
    }
  }
  for (const value of progress.values()) for (let index = 0; index < value.daily.length; index += 1) value.daily[index] = Math.min(value.daily[index], config.dailyPointCap)

  const guildMembers = new Map<string, SeasonRosterEntry[]>()
  for (const player of roster) guildMembers.set(player.guildId, [...(guildMembers.get(player.guildId) ?? []), player])
  const pointsByPlayer = new Map<string, number>()
  for (const [id, value] of progress) pointsByPlayer.set(id, value.daily.reduce((sum, amount) => sum + amount, 0))
  const guildScores = Object.fromEntries(Object.keys(season.guilds).map((id) => [id, season.guilds[id].totalScore]))
  for (const guild of scenario.guilds) if (!(guild.id in guildScores)) guildScores[guild.id] = 0
  for (const guildId of Object.keys(guildScores)) if (!guildMembers.has(guildId)) guildMembers.set(guildId, [])
  const ranks = calculateRankGroups(guildScores)
  const guildResults: Record<string, RewardGuildResult> = {}
  for (const [guildId, members] of guildMembers) {
    const completionRate = members.length === 0 ? 0 : members.reduce((sum, member) => sum + Math.min(pointsByPlayer.get(member.playerId) ?? 0, config.targetPoints), 0) / (members.length * config.targetPoints)
    const rankInfo = ranks.get(guildId) ?? { rank: Object.keys(guildScores).length + 1, occupiedRanks: [] }
    const rankMerit = rankInfo.occupiedRanks.length === 0 ? 0 : halfUp(rankInfo.occupiedRanks.reduce((sum, rank) => sum + rankConfig(config, rank).merit, 0) / rankInfo.occupiedRanks.length)
    guildResults[guildId] = {
      guildId, memberCount: members.length, completionRate, milestonesUnlocked: config.guildMilestones.filter((milestone) => completionRate >= milestone.completionRate).length,
      milestoneAchievementRates: config.guildMilestones.map((milestone) => completionRate >= milestone.completionRate ? 1 : 0), rank: rankInfo.rank, occupiedRanks: rankInfo.occupiedRanks, rankMerit,
    }
  }

  const players: RewardPlayerResult[] = []
  const sources = { personal: {}, guild: {}, rank: {}, titles: {}, legacyFree: {} } as Record<keyof RewardModelResult['sources'], Record<number, number>>
  for (const rosterPlayer of roster) {
    const value = progress.get(rosterPlayer.playerId) ?? { daily: Array(days).fill(0), active: new Set<number>(), defense: new Set<number>(), eventIds: new Set<string>() }
    const points = value.daily.reduce((sum, amount) => sum + amount, 0)
    const personalRewards: Record<number, number> = {}
    const guildRewards: Record<number, number> = {}
    const rankRewards: Record<number, number> = {}
    const personalStagesUnlocked = config.personalStages.filter((stage) => points >= stage.points).length
    for (const stage of config.personalStages.slice(0, personalStagesUnlocked)) addItems(personalRewards, stage.rewards)
    const guildResult = guildResults[rosterPlayer.guildId]
    for (let index = 0; index < (guildResult?.milestonesUnlocked ?? 0); index += 1) {
      const milestone = config.guildMilestones[index]
      if (points >= config.targetPoints * milestone.minimumPersonalRate) addItems(guildRewards, milestone.rewards)
    }
    const activeDays = new Set([...value.active, ...value.defense])
    const rankEligible = activeDays.size >= config.rankMinActiveDays && points >= config.targetPoints * config.rankMinProgressRate
    let title: RewardItem | null = null
    if (rankEligible && guildResult) {
      addResource(rankRewards, 90, guildResult.rankMerit)
      const rank = rankConfig(config, guildResult.rank)
      title = { resourceId: 601, quantity: 1, label: rank.titleLabel, extra: { titleId: rank.titleId, label: rank.titleLabel } }
    }
    const totalRewards = sumMaps(personalRewards, guildRewards, rankRewards, title ? { 601: title.quantity } : {})
    addItems(sources.personal, Object.entries(personalRewards).map(([resourceId, quantity]) => ({ resourceId: Number(resourceId), quantity })))
    addItems(sources.guild, Object.entries(guildRewards).map(([resourceId, quantity]) => ({ resourceId: Number(resourceId), quantity })))
    addItems(sources.rank, Object.entries(rankRewards).map(([resourceId, quantity]) => ({ resourceId: Number(resourceId), quantity })))
    if (title) addItems(sources.titles, [title])
    players.push({ playerId: rosterPlayer.playerId, guildId: rosterPlayer.guildId, tier: rosterPlayer.tier, points, dailyPoints: value.daily, activeDays: activeDays.size, defenseActiveDays: value.defense.size, personalStagesUnlocked, rankEligible, personalRewards, guildRewards, rankRewards, title, totalRewards })
  }
  const newIssuance = players.reduce((result, player) => sumMaps(result, player.totalRewards), {} as Record<number, number>)
  const legacyFree = Object.fromEntries(Object.entries(FREE_PASS).map(([resourceId, quantity]) => [Number(resourceId), quantity * players.length]))
  const issuance = config.legacyFreeMode === 'stack' ? sumMaps(newIssuance, legacyFree) : newIssuance
  const legacyFreeDelta: Record<number, number> = {}
  for (const resourceId of Object.keys(FREE_PASS).map(Number)) legacyFreeDelta[resourceId] = (newIssuance[resourceId] ?? 0) - FREE_PASS[resourceId] * players.length
  const tierResults = Object.fromEntries(TIERS.map((tier) => {
    const tierPlayers = players.filter((player) => player.tier === tier)
    const resourceIds = [...new Set(tierPlayers.flatMap((player) => Object.keys(player.totalRewards).map(Number)))]
    return [tier, { averageRewards: Object.fromEntries(resourceIds.map((resourceId) => [resourceId, { p10: 0, median: tierPlayers.reduce((sum, player) => sum + (player.totalRewards[resourceId] ?? 0), 0) / Math.max(1, tierPlayers.length), p90: 0, mean: tierPlayers.reduce((sum, player) => sum + (player.totalRewards[resourceId] ?? 0), 0) / Math.max(1, tierPlayers.length) }])) }]
  })) as Record<Tier, { averageRewards: Record<number, RewardQuantiles> }>
  return {
    mode: season.mode ?? 'deterministic', settlementTiming: 'season-end', players, guilds: guildResults, issuance, sources: { ...sources, legacyFree: config.legacyFreeMode === 'stack' ? legacyFree : {} }, completionRate: players.length === 0 ? 0 : players.reduce((sum, player) => sum + Math.min(player.points, config.targetPoints) / config.targetPoints, 0) / players.length, eligibleCount: players.filter((player) => player.rankEligible).length, legacyFreeDelta, audit: { legacyProgressThreshold: config.legacyProgressThreshold, targetPoints: config.targetPoints, legacyFreePerPlayer: { ...FREE_PASS }, replacementMode: config.legacyFreeMode }, tiers: tierResults,
  }
}

export function aggregateRewardModels(results: RewardModelResult[]): RewardDistribution {
  if (results.some((result) => result.mode !== 'stochastic')) throw new Error('奖励分布只能聚合 stochastic/蒙特卡洛结果')
  if (results.length === 0) return { mode: 'monte-carlo', runs: 0, completionRate: rateQuantiles([]), eligibleCount: rateQuantiles([]), issuance: {}, guilds: {}, tiers: { normal: { averageRewards: {} }, small: { averageRewards: {} }, whale: { averageRewards: {} } } }
  const resourceIds = [...new Set(results.flatMap((result) => Object.keys(result.issuance).map(Number)))]
  const guildIds = [...new Set(results.flatMap((result) => Object.keys(result.guilds)))]
  const tiers = Object.fromEntries(TIERS.map((tier) => {
    const resourceIdsForTier = [...new Set(results.flatMap((result) => Object.keys(result.tiers[tier]?.averageRewards ?? {}).map(Number)))]
    return [tier, { averageRewards: Object.fromEntries(resourceIdsForTier.map((resourceId) => [resourceId, rateQuantiles(results.map((result) => result.tiers[tier]?.averageRewards[resourceId]?.mean ?? 0))])) }]
  })) as RewardDistribution['tiers']
  return {
    mode: 'monte-carlo', runs: results.length,
    completionRate: rateQuantiles(results.map((result) => result.completionRate)),
    eligibleCount: rateQuantiles(results.map((result) => result.eligibleCount)),
    issuance: Object.fromEntries(resourceIds.map((resourceId) => [resourceId, rateQuantiles(results.map((result) => result.issuance[resourceId] ?? 0))])),
    guilds: Object.fromEntries(guildIds.map((guildId) => [guildId, { milestoneAchievementRates: Array.from({ length: Math.max(0, results[0].guilds[guildId]?.milestoneAchievementRates.length ?? 0) }, (_, index) => rateQuantiles(results.map((result) => result.guilds[guildId]?.milestoneAchievementRates[index] ?? 0))) }])),
    tiers,
  }
}

export { cloneItems }
