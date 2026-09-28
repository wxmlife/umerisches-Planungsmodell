import {
  calculatePreRandomPower,
  resolveBattle,
  uniformWinProbability,
  type CombatantInput,
} from './battle'
import {
  activateOffer,
  advanceEconomy,
  createEconomyState,
  type EconomyState,
  type SpendEvent,
} from './economy'
import { EventQueue } from './eventQueue'
import type { Rng } from './rng'
import type {
  GuildConfig,
  NodeKind,
  RecoveryOffer,
  Scenario,
  Tier,
} from './types'

export type SeasonMode = 'deterministic' | 'stochastic'

export interface SeasonSnapshot {
  minute: number
  day: number
  guildId: string
  totalScore: number
  attackScore: number
  holdingScore: number
  normalNodes: number
  coreNodes: number
  centerNodes: number
  availableFans: number
  garrisonFans: number
  lostFans: number
  cumulativeUsd: number
  cumulativeDiamonds: number
  cumulativeAds: number
}

export interface GuildSeasonResult {
  totalScore: number
  attackScore: number
  holdingScore: number
  defenderGuildScore: 0
  personalDefenseContribution: number
  maxSimultaneousGarrisons: number
  maxGarrisonsPerPlayer: number
  actionCapacityBlocks: { formation: number; cooldown: number }
  returnedOverflowFans: number
  supplyBySource: Record<
    string,
    { theoreticalFans: number; acceptedFans: number; wastedFans: number }
  >
}

export interface SeasonEvent {
  minute: number
  day: number
  type: 'unlock' | 'deploy' | 'battle' | 'purchase'
  guildId?: string
  playerId?: string
  nodeId?: string
  nodeKind?: NodeKind
  attackerWon?: boolean
  attackScoreDelta?: number
}

export interface SeasonResult {
  guilds: Record<string, GuildSeasonResult>
  snapshots: SeasonSnapshot[]
  events: SeasonEvent[]
  spendEvents: SpendEvent[]
  eventCount: number
  termination: 'season-end' | 'event-limit'
  terminationMinute: number | null
  invariants: {
    singleOwnerPerNode: boolean
    nonnegativeFans: boolean
    holdingScoreReconciled: boolean
  }
}

interface Garrison {
  guildId: string
  playerId: string
  idolPower: number
  initialFans: number
  currentFans: number
}

interface CombatNode {
  id: string
  kind: NodeKind
  scoring: true
  unlocked: boolean
  ownerGuildId: string | null
  garrison: Garrison | null
}

interface StartNode {
  id: string
  kind: 'start'
  scoring: false
  unlocked: true
  ownerGuildId: string
  garrison: null
}

type SeasonNode = CombatNode | StartNode

interface PlayerState {
  id: string
  guildId: string
  tier: Tier
  idolPower: number
  economy: EconomyState
  economyMinute: number
  garrisonNodeIds: Set<string>
  nextActionMinute: number
  actionsToday: number
  defenseCreditsToday: number
  lostFans: number
  dailyUsdSpent: number
  dailyDiamondSpent: number
  dailyAdsUsed: number
  dailyPurchases: Record<string, number>
}

interface MutableGuildResult extends GuildSeasonResult {
  heldMultiplier: number
  holdingLedger: number
  cumulativeUsd: number
  cumulativeDiamonds: number
  cumulativeAds: number
}

type InternalEvent =
  | { minute: number; priority: number; kind: 'day-reset' }
  | { minute: number; priority: number; kind: 'unlock-center' }
  | { minute: number; priority: number; kind: 'action'; playerId: string }
  | { minute: number; priority: number; kind: 'snapshot' }

interface TargetChoice {
  node: CombatNode
  deployedFans: number
  utility: number
}

const TIERS: Tier[] = ['normal', 'small', 'whale']
const NODE_KINDS: NodeKind[] = ['normal', 'core', 'center']
const SYSTEM_PRIORITY = 10
const ACTION_PRIORITY = 20
const SNAPSHOT_PRIORITY = 30
const EPSILON = 1e-9

function seasonDay(minute: number, days: number): number {
  return Math.min(days, Math.floor(minute / 1440) + 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(rng.next() * (index + 1))
    ;[copy[index], copy[swapWith]] = [copy[swapWith], copy[index]]
  }
  return copy
}

function fixedRollRng(): Rng {
  return { next: () => 0.5 }
}

function buildNodes(scenario: Scenario): SeasonNode[] {
  const nodes: SeasonNode[] = scenario.guilds.map((guild) => ({
    id: `start-${guild.id}`,
    kind: 'start',
    scoring: false,
    unlocked: true,
    ownerGuildId: guild.id,
    garrison: null,
  }))

  for (const kind of NODE_KINDS) {
    const count = scenario.season.nodeCounts[kind]
    for (let index = 0; index < count; index += 1) {
      nodes.push({
        id: `${kind}-${String(index + 1).padStart(2, '0')}`,
        kind,
        scoring: true,
        unlocked: kind !== 'center' || scenario.season.centerUnlockDay <= 1,
        ownerGuildId: null,
        garrison: null,
      })
    }
  }
  return nodes
}

function buildPlayers(scenario: Scenario): PlayerState[] {
  const players: PlayerState[] = []
  for (const guild of scenario.guilds) {
    for (const tier of TIERS) {
      for (let index = 0; index < guild.roster[tier]; index += 1) {
        players.push({
          id: `${guild.id}-${tier}-${index + 1}`,
          guildId: guild.id,
          tier,
          idolPower: scenario.battle.baseIdolPower * scenario.battle.tierMultipliers[tier],
          economy: createEconomyState(scenario.fans.capacity, scenario.fans.capacity),
          economyMinute: 0,
          garrisonNodeIds: new Set(),
          nextActionMinute: 0,
          actionsToday: 0,
          defenseCreditsToday: 0,
          lostFans: 0,
          dailyUsdSpent: 0,
          dailyDiamondSpent: 0,
          dailyAdsUsed: 0,
          dailyPurchases: {},
        })
      }
    }
  }
  return players
}

function createGuildResults(scenario: Scenario): Record<string, MutableGuildResult> {
  return Object.fromEntries(scenario.guilds.map((guild) => [guild.id, {
    totalScore: 0,
    attackScore: 0,
    holdingScore: 0,
    defenderGuildScore: 0 as const,
    personalDefenseContribution: 0,
    maxSimultaneousGarrisons: 0,
    maxGarrisonsPerPlayer: 0,
    actionCapacityBlocks: { formation: 0, cooldown: 0 },
    returnedOverflowFans: 0,
    supplyBySource: {},
    heldMultiplier: 0,
    holdingLedger: 0,
    cumulativeUsd: 0,
    cumulativeDiamonds: 0,
    cumulativeAds: 0,
  }]))
}

export function runSeason(
  scenario: Scenario,
  rng: Rng,
  mode: SeasonMode,
): SeasonResult {
  const endMinute = scenario.season.days * 1440
  const queue = new EventQueue<InternalEvent>()
  const nodes = buildNodes(scenario)
  const players = buildPlayers(scenario)
  const playerById = new Map(players.map((player) => [player.id, player]))
  const guildById = new Map(scenario.guilds.map((guild) => [guild.id, guild]))
  const guildPlayers = new Map<string, PlayerState[]>()
  for (const guild of scenario.guilds) {
    guildPlayers.set(guild.id, players.filter((player) => player.guildId === guild.id))
  }
  const guilds = createGuildResults(scenario)
  const events: SeasonEvent[] = []
  const snapshots: SeasonSnapshot[] = []
  const spendEvents: SpendEvent[] = []
  const scheduledActionMinute = new Map<string, number>()
  const processedByDay = new Map<number, number>()
  let lastHoldingMinute = 0
  let eventCount = 0
  let termination: SeasonResult['termination'] = 'season-end'
  let terminationMinute: number | null = null

  const advancePlayer = (player: PlayerState, minute: number) => {
    if (minute < player.economyMinute) throw new Error('Player economy moved backward')
    player.economy = advanceEconomy(
      player.economy,
      player.economyMinute,
      minute,
      scenario.fans,
      scenario.supply,
    )
    player.economyMinute = minute
  }

  const accrueHolding = (minute: number) => {
    if (minute <= lastHoldingMinute) return
    const elapsedHours = (minute - lastHoldingMinute) / 60
    for (const guild of Object.values(guilds)) {
      const delta = elapsedHours * scenario.score.holdPerHourBase * guild.heldMultiplier
      guild.holdingScore += delta
      guild.holdingLedger += delta
      guild.totalScore = guild.attackScore + guild.holdingScore
    }
    lastHoldingMinute = minute
  }

  const orderedPlayers = (minute: number): PlayerState[] => {
    if (mode === 'stochastic') return shuffled(players, rng)
    const dayOffset = seasonDay(minute, scenario.season.days) - 1
    const guildOrder = scenario.guilds.map((guild) => guild.id)
    const rotatedGuilds = guildOrder.length === 0
      ? []
      : guildOrder.map((_, index) => guildOrder[(index + dayOffset) % guildOrder.length])
    return rotatedGuilds.flatMap((guildId) => {
      const members = guildPlayers.get(guildId) ?? []
      if (members.length === 0) return []
      return members.map((_, index) => members[(index + dayOffset) % members.length])
    })
  }

  const hasFreeFormation = (player: PlayerState) => (
    player.garrisonNodeIds.size < scenario.fans.formationSlots
  )

  const hasOpenTarget = (guildId: string) => nodes.some((node) => (
    node.scoring
    && node.unlocked
    && node.ownerGuildId !== guildId
    && (guildById.get(guildId)?.priorities[node.kind] ?? 0) > 0
  ))

  const scheduleAction = (
    player: PlayerState,
    requestedMinute: number,
    recoveryChanged = false,
  ) => {
    if (requestedMinute > endMinute) return
    const resourceReady = player.economy.availableFans >= scenario.fans.minDeploy
      && hasOpenTarget(player.guildId)
    if (!hasFreeFormation(player)) {
      if (resourceReady) guilds[player.guildId].actionCapacityBlocks.formation += 1
      return
    }
    const minute = Math.max(requestedMinute, player.nextActionMinute)
    if (minute > requestedMinute && resourceReady) {
      guilds[player.guildId].actionCapacityBlocks.cooldown += 1
    }
    if (minute > endMinute) return
    const existing = scheduledActionMinute.get(player.id)
    if (existing !== undefined && existing <= minute) return
    if (
      existing !== undefined
      && player.economy.availableFans < scenario.fans.minDeploy
      && !recoveryChanged
    ) return
    scheduledActionMinute.set(player.id, minute)
    queue.push({ minute, priority: ACTION_PRIORITY, kind: 'action', playerId: player.id })
  }

  const scheduleAll = (minute: number) => {
    for (const player of orderedPlayers(minute)) scheduleAction(player, minute)
  }

  const selectTarget = (
    player: PlayerState,
    guild: GuildConfig,
    availableFans: number,
  ): TargetChoice | undefined => {
    const choices: TargetChoice[] = []
    for (const node of nodes) {
      if (!node.scoring || !node.unlocked) continue
      if (node.ownerGuildId === player.guildId || guild.priorities[node.kind] <= 0) continue
      const configured = clamp(
        guild.deployFans[node.kind],
        scenario.fans.minDeploy,
        scenario.fans.maxDeploy,
      )
      const deployedFans = Math.min(
        Math.max(availableFans, scenario.fans.minDeploy),
        configured,
      )
      let captureProbability = 1
      if (node.garrison) {
        const attackerPower = calculatePreRandomPower({
          idolPower: player.idolPower,
          initialFans: deployedFans,
          currentFans: deployedFans,
          styleMultiplier: 1,
        }, scenario.battle)
        const defenderPower = calculatePreRandomPower({
          idolPower: node.garrison.idolPower,
          initialFans: node.garrison.initialFans,
          currentFans: node.garrison.currentFans,
          styleMultiplier: 1,
        }, scenario.battle)
        captureProbability = uniformWinProbability(
          attackerPower,
          defenderPower,
          scenario.battle.randomMin,
          scenario.battle.randomMax,
        )
      }
      choices.push({
        node,
        deployedFans,
        utility: guild.priorities[node.kind]
          * scenario.score.nodeMultipliers[node.kind]
          * (captureProbability + 0.25)
          / deployedFans,
      })
    }
    if (choices.length === 0) return undefined
    const bestUtility = Math.max(...choices.map((choice) => choice.utility))
    const tied = choices.filter((choice) => Math.abs(choice.utility - bestUtility) <= EPSILON)
    if (mode === 'stochastic' && tied.length > 1) {
      return tied[Math.floor(rng.next() * tied.length)]
    }
    return tied.sort((a, b) => a.node.id.localeCompare(b.node.id))[0]
  }

  const recordOwnershipMetrics = (guildId: string, player: PlayerState) => {
    const guildNodeCount = nodes.filter(
      (node) => node.scoring && node.ownerGuildId === guildId && node.garrison,
    ).length
    guilds[guildId].maxSimultaneousGarrisons = Math.max(
      guilds[guildId].maxSimultaneousGarrisons,
      guildNodeCount,
    )
    guilds[guildId].maxGarrisonsPerPlayer = Math.max(
      guilds[guildId].maxGarrisonsPerPlayer,
      player.garrisonNodeIds.size,
    )
  }

  const changeOwner = (
    node: CombatNode,
    ownerGuildId: string | null,
    garrison: Garrison | null,
  ) => {
    const multiplier = scenario.score.nodeMultipliers[node.kind]
    if (node.ownerGuildId) guilds[node.ownerGuildId].heldMultiplier -= multiplier
    node.ownerGuildId = ownerGuildId
    node.garrison = garrison
    if (ownerGuildId) guilds[ownerGuildId].heldMultiplier += multiplier
  }

  const returnFans = (
    player: PlayerState,
    fans: number,
    guildId: string,
  ) => {
    advancePlayer(player, player.economyMinute)
    const room = Math.max(0, scenario.fans.capacity - player.economy.availableFans)
    const accepted = Math.min(room, Math.max(0, fans))
    player.economy.availableFans += accepted
    guilds[guildId].returnedOverflowFans += Math.max(0, fans - accepted)
  }

  const offerEligible = (
    player: PlayerState,
    offer: RecoveryOffer,
  ): boolean => {
    const policy = scenario.supply.purchasePolicies[player.tier]
    const count = player.dailyPurchases[offer.id] ?? 0
    if (offer.dailyPurchaseLimit !== null && count >= offer.dailyPurchaseLimit) return false
    if (offer.adCost > 0 && (!policy.useAds || player.dailyAdsUsed + offer.adCost > scenario.supply.adDailyLimit)) {
      return false
    }
    if (player.dailyUsdSpent + offer.usdCost > policy.dailyUsdBudget + EPSILON) return false
    if (player.dailyDiamondSpent + offer.diamondCost > policy.dailyDiamondBudget + EPSILON) return false
    return true
  }

  const purchaseOffer = (player: PlayerState, minute: number): boolean => {
    if (player.economy.activeProgram || player.economy.queue.length > 0) return false
    const policy = scenario.supply.purchasePolicies[player.tier]
    for (const offerId of policy.supplyPriority) {
      const offer = scenario.supply.offers.find((candidate) => candidate.id === offerId)
      if (!offer || !offerEligible(player, offer)) continue
      player.economy = activateOffer(
        player.economy,
        offer.id,
        minute,
        scenario.supply,
        { guildId: player.guildId, playerId: player.id, tier: player.tier },
      )
      player.dailyUsdSpent += offer.usdCost
      player.dailyDiamondSpent += offer.diamondCost
      player.dailyAdsUsed += offer.adCost
      player.dailyPurchases[offer.id] = (player.dailyPurchases[offer.id] ?? 0) + 1
      guilds[player.guildId].cumulativeUsd += offer.usdCost
      guilds[player.guildId].cumulativeDiamonds += offer.diamondCost
      guilds[player.guildId].cumulativeAds += offer.adCost
      const spend = player.economy.spendLedger.at(-1)!
      spendEvents.push({ ...spend })
      events.push({
        minute,
        day: seasonDay(minute, scenario.season.days),
        type: 'purchase',
        guildId: player.guildId,
        playerId: player.id,
      })
      return true
    }
    return false
  }

  const nextRecoveryMinute = (player: PlayerState, minute: number): number | null => {
    const candidates: number[] = []
    const nextPulse = player.economy.scheduledPulses.find((pulse) => pulse.minute > minute)?.minute
    if (nextPulse !== undefined) candidates.push(nextPulse)
    if (player.economy.activeProgram?.endMinute && player.economy.activeProgram.endMinute > minute) {
      candidates.push(player.economy.activeProgram.endMinute)
    }
    let perMinute = scenario.fans.capacity * scenario.fans.naturalCapacityPerDay / 1440
    if (player.economy.activeProgram) {
      const offer = scenario.supply.offers.find(
        (candidate) => candidate.id === player.economy.activeProgram?.offerId,
      )
      if (offer && offer.durationMinutes > 0) {
        perMinute += scenario.fans.capacity
          * offer.continuousCapacityRate
          / offer.durationMinutes
      }
    }
    if (perMinute > 0) {
      const missing = scenario.fans.minDeploy - player.economy.availableFans
      candidates.push(minute + Math.max(1, Math.ceil(missing / perMinute - EPSILON)))
    }
    const nextDay = (Math.floor(minute / 1440) + 1) * 1440
    if (nextDay <= endMinute) candidates.push(nextDay)
    const usable = candidates.filter((candidate) => candidate > minute && candidate <= endMinute)
    return usable.length > 0 ? Math.min(...usable) : null
  }

  const creditDefense = (
    defender: PlayerState,
    nodeKind: NodeKind,
    defenderWon: boolean,
  ) => {
    if (defender.defenseCreditsToday >= scenario.score.defenderPersonalDailyCap) return
    defender.defenseCreditsToday += 1
    guilds[defender.guildId].personalDefenseContribution += defenderWon
      ? scenario.score.defenderPersonalWinBase * scenario.score.nodeMultipliers[nodeKind]
      : scenario.score.defenderPersonalLoss
  }

  const handleAction = (player: PlayerState, minute: number) => {
    const guild = guildById.get(player.guildId)
    if (!guild || !hasFreeFormation(player)) return
    const dailyLimit = scenario.fans.dailyActionLimit
    if (dailyLimit !== null && player.actionsToday >= dailyLimit) return
    if (!hasOpenTarget(player.guildId)) return

    const targetBeforeRecovery = selectTarget(
      player,
      guild,
      Math.max(player.economy.availableFans, scenario.fans.minDeploy),
    )
    if (!targetBeforeRecovery) return

    if (player.economy.availableFans < scenario.fans.minDeploy) {
      if (!player.economy.activeProgram && player.economy.queue.length === 0) {
        purchaseOffer(player, minute)
      }
      if (player.economy.availableFans >= scenario.fans.minDeploy) {
        scheduleAction(player, minute)
      } else {
        const recoveryMinute = nextRecoveryMinute(player, minute)
        if (recoveryMinute !== null) scheduleAction(player, recoveryMinute)
      }
      return
    }

    const target = selectTarget(player, guild, player.economy.availableFans)
    if (!target) return
    const { node, deployedFans } = target
    player.economy.availableFans -= deployedFans
    player.actionsToday += 1
    player.nextActionMinute = minute + scenario.fans.attackCooldownMinutes

    if (!node.ownerGuildId || !node.garrison) {
      const garrison: Garrison = {
        guildId: player.guildId,
        playerId: player.id,
        idolPower: player.idolPower,
        initialFans: deployedFans,
        currentFans: deployedFans,
      }
      changeOwner(node, player.guildId, garrison)
      player.garrisonNodeIds.add(node.id)
      recordOwnershipMetrics(player.guildId, player)
      events.push({
        minute,
        day: seasonDay(minute, scenario.season.days),
        type: 'deploy',
        guildId: player.guildId,
        playerId: player.id,
        nodeId: node.id,
        nodeKind: node.kind,
        attackScoreDelta: 0,
      })
    } else {
      const defendingGarrison = node.garrison
      const defender = playerById.get(defendingGarrison.playerId)
      if (!defender) throw new Error(`Missing defender ${defendingGarrison.playerId}`)
      advancePlayer(defender, minute)
      const attackerInput: CombatantInput = {
        idolPower: player.idolPower,
        initialFans: deployedFans,
        currentFans: deployedFans,
        styleMultiplier: 1,
      }
      const defenderInput: CombatantInput = {
        idolPower: defendingGarrison.idolPower,
        initialFans: defendingGarrison.initialFans,
        currentFans: defendingGarrison.currentFans,
        styleMultiplier: 1,
      }
      const outcome = resolveBattle(
        scenario.battle,
        attackerInput,
        defenderInput,
        mode === 'deterministic' ? fixedRollRng() : rng,
      )
      player.lostFans += outcome.attackerLoss
      defender.lostFans += outcome.defenderLoss
      let attackScoreDelta: number

      if (outcome.attackerWon) {
        defender.garrisonNodeIds.delete(node.id)
        returnFans(defender, outcome.defenderFansAfter, defender.guildId)
        const garrison: Garrison = {
          guildId: player.guildId,
          playerId: player.id,
          idolPower: player.idolPower,
          initialFans: deployedFans,
          currentFans: outcome.attackerFansAfter,
        }
        changeOwner(node, player.guildId, garrison)
        player.garrisonNodeIds.add(node.id)
        attackScoreDelta = scenario.score.attackWinBase
          * scenario.score.nodeMultipliers[node.kind]
        creditDefense(defender, node.kind, false)
        recordOwnershipMetrics(player.guildId, player)
        scheduleAction(defender, minute, true)
      } else {
        defendingGarrison.currentFans = outcome.defenderFansAfter
        returnFans(player, outcome.attackerFansAfter, player.guildId)
        attackScoreDelta = scenario.score.attackLoss
        creditDefense(defender, node.kind, true)
      }

      guilds[player.guildId].attackScore += attackScoreDelta
      guilds[player.guildId].totalScore = guilds[player.guildId].attackScore
        + guilds[player.guildId].holdingScore
      events.push({
        minute,
        day: seasonDay(minute, scenario.season.days),
        type: 'battle',
        guildId: player.guildId,
        playerId: player.id,
        nodeId: node.id,
        nodeKind: node.kind,
        attackerWon: outcome.attackerWon,
        attackScoreDelta,
      })
    }

    scheduleAll(minute)
  }

  const emitSnapshots = (minute: number) => {
    for (const player of players) advancePlayer(player, minute)
    for (const guildConfig of scenario.guilds) {
      const members = guildPlayers.get(guildConfig.id) ?? []
      const ownedNodes = nodes.filter((node): node is CombatNode => (
        node.scoring && node.ownerGuildId === guildConfig.id
      ))
      const counts: Record<NodeKind, number> = { normal: 0, core: 0, center: 0 }
      for (const node of ownedNodes) counts[node.kind] += 1
      snapshots.push({
        minute,
        day: seasonDay(minute, scenario.season.days),
        guildId: guildConfig.id,
        totalScore: guilds[guildConfig.id].attackScore + guilds[guildConfig.id].holdingScore,
        attackScore: guilds[guildConfig.id].attackScore,
        holdingScore: guilds[guildConfig.id].holdingScore,
        normalNodes: counts.normal,
        coreNodes: counts.core,
        centerNodes: counts.center,
        availableFans: members.reduce((sum, player) => sum + player.economy.availableFans, 0),
        garrisonFans: ownedNodes.reduce(
          (sum, node) => sum + (node.garrison?.currentFans ?? 0),
          0,
        ),
        lostFans: members.reduce((sum, player) => sum + player.lostFans, 0),
        cumulativeUsd: guilds[guildConfig.id].cumulativeUsd,
        cumulativeDiamonds: guilds[guildConfig.id].cumulativeDiamonds,
        cumulativeAds: guilds[guildConfig.id].cumulativeAds,
      })
    }
  }

  scheduleAll(0)
  for (let minute = 0; minute <= endMinute; minute += 60) {
    queue.push({ minute, priority: SNAPSHOT_PRIORITY, kind: 'snapshot' })
  }
  for (let dayIndex = 1; dayIndex < scenario.season.days; dayIndex += 1) {
    queue.push({ minute: dayIndex * 1440, priority: SYSTEM_PRIORITY, kind: 'day-reset' })
  }
  const centerUnlockMinute = (scenario.season.centerUnlockDay - 1) * 1440
  if (scenario.season.nodeCounts.center > 0 && centerUnlockMinute > 0) {
    queue.push({
      minute: centerUnlockMinute,
      priority: SYSTEM_PRIORITY,
      kind: 'unlock-center',
    })
  }

  while (queue.size > 0) {
    const event = queue.pop()!
    if (event.minute > endMinute) break
    accrueHolding(event.minute)
    eventCount += 1
    const day = seasonDay(event.minute, scenario.season.days)
    const processed = (processedByDay.get(day) ?? 0) + 1
    processedByDay.set(day, processed)
    if (processed > scenario.simulation.maxEventsPerDay) {
      termination = 'event-limit'
      terminationMinute = event.minute
      break
    }

    if (event.kind === 'day-reset') {
      for (const player of players) {
        player.actionsToday = 0
        player.defenseCreditsToday = 0
        player.dailyUsdSpent = 0
        player.dailyDiamondSpent = 0
        player.dailyAdsUsed = 0
        player.dailyPurchases = {}
      }
      scheduleAll(event.minute)
    } else if (event.kind === 'unlock-center') {
      for (const node of nodes) {
        if (node.kind === 'center') node.unlocked = true
      }
      events.push({
        minute: event.minute,
        day,
        type: 'unlock',
        nodeKind: 'center',
      })
      scheduleAll(event.minute)
    } else if (event.kind === 'action') {
      if (scheduledActionMinute.get(event.playerId) !== event.minute) continue
      scheduledActionMinute.delete(event.playerId)
      const player = playerById.get(event.playerId)
      if (!player) continue
      advancePlayer(player, event.minute)
      handleAction(player, event.minute)
    } else {
      emitSnapshots(event.minute)
    }
  }

  if (termination === 'season-end') accrueHolding(endMinute)
  for (const player of players) advancePlayer(player, endMinute)

  for (const [guildId, guild] of Object.entries(guilds)) {
    guild.totalScore = guild.attackScore + guild.holdingScore
    const members = guildPlayers.get(guildId) ?? []
    for (const player of members) {
      const sourceIds = new Set([
        ...Object.keys(player.economy.theoreticalBySource),
        ...Object.keys(player.economy.recoveredBySource),
        ...Object.keys(player.economy.wastedBySource),
      ])
      for (const sourceId of sourceIds) {
        const current = guild.supplyBySource[sourceId] ?? {
          theoreticalFans: 0,
          acceptedFans: 0,
          wastedFans: 0,
        }
        current.theoreticalFans += player.economy.theoreticalBySource[sourceId] ?? 0
        current.acceptedFans += player.economy.recoveredBySource[sourceId] ?? 0
        current.wastedFans += player.economy.wastedBySource[sourceId] ?? 0
        guild.supplyBySource[sourceId] = current
      }
    }
  }

  const publicGuilds = Object.fromEntries(Object.entries(guilds).map(([guildId, guild]) => [
    guildId,
    {
      totalScore: guild.totalScore,
      attackScore: guild.attackScore,
      holdingScore: guild.holdingScore,
      defenderGuildScore: 0 as const,
      personalDefenseContribution: guild.personalDefenseContribution,
      maxSimultaneousGarrisons: guild.maxSimultaneousGarrisons,
      maxGarrisonsPerPlayer: guild.maxGarrisonsPerPlayer,
      actionCapacityBlocks: guild.actionCapacityBlocks,
      returnedOverflowFans: guild.returnedOverflowFans,
      supplyBySource: guild.supplyBySource,
    },
  ]))

  const combatNodes = nodes.filter((node): node is CombatNode => node.scoring)
  const singleOwnerPerNode = combatNodes.every((node) => (
    (node.ownerGuildId === null && node.garrison === null)
    || (node.ownerGuildId !== null && node.garrison?.guildId === node.ownerGuildId)
  ))
  const nonnegativeFans = players.every((player) => (
    Number.isInteger(player.economy.availableFans)
    && player.economy.availableFans >= 0
    && player.economy.availableFans <= scenario.fans.capacity
  )) && combatNodes.every((node) => (
    !node.garrison
    || (Number.isInteger(node.garrison.currentFans) && node.garrison.currentFans >= 0)
  ))
  const holdingScoreReconciled = Object.values(guilds).every(
    (guild) => Math.abs(guild.holdingScore - guild.holdingLedger) <= 1e-8,
  )

  return {
    guilds: publicGuilds,
    snapshots,
    events,
    spendEvents,
    eventCount,
    termination,
    terminationMinute,
    invariants: { singleOwnerPerNode, nonnegativeFans, holdingScoreReconciled },
  }
}
