import { DEFAULT_BATTLE_FORMULAS, DEFAULT_REWARD_CONFIG, DEFAULT_SCENARIO } from '../domain/defaults'
import type { Scenario } from '../domain/types'
import { createDefaultAnalysis, createSimulatorState, simulatorReducer, validateAnalysis, type SimulatorAnalysis, type SimulatorState } from './simulatorReducer'
import { validateDraftScenario } from './scenarioLifecycle'

export const STORAGE_KEY = 'alliance-war-simulator/scenario/v3'
export const RECOVERY_KEY = 'alliance-war-simulator/recovery/latest'
export type SimulatorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export interface PersistedEnvelopeV3 {
  schemaVersion: 3
  savedAt: string
  draftScenario: Scenario
  appliedScenario: Scenario
  analysis: SimulatorAnalysis
}
export interface LoadResult { state: SimulatorState; notice: string | null; recoveryRaw: string | null; sourceRaw: string | null }

type Shape = 'number' | 'string' | 'boolean' | 'nullable-number' | { [key: string]: Shape } | [Shape]
const tierNumbers: Shape = { normal: 'number', small: 'number', whale: 'number' }
const nodeNumbers: Shape = { normal: 'number', core: 'number', center: 'number' }
const policy: Shape = { versionUsdBudget: 'number', versionDiamondBudget: 'number', versionAdBudget: 'number', useAds: 'boolean', supplyPriority: ['string'] }
const rewardItem: Shape = { resourceId: 'number', quantity: 'number' }
const rewardShape: Shape = {
  targetPoints: 'number', dailyPointCap: 'number', rankMinActiveDays: 'number', rankMinProgressRate: 'number',
  personalStages: [{ points: 'number', rewards: [rewardItem] }],
  guildMilestones: [{ completionRate: 'number', minimumPersonalRate: 'number', rewards: [rewardItem] }],
  rankRewards: [{ rank: 'number', merit: 'number', titleId: 'nullable-number', titleLabel: 'string' }],
  legacyProgressThreshold: 'number', legacyFreeMode: 'string',
}
const scenarioShape: Shape = {
  battle: {
    formulas: { preRandomPower: 'string', displayedTendency: 'string', winProbability: 'string', fanLoss: 'string' },
    baseIdolPower: 'number', tierMultipliers: tierNumbers, alpha: 'number', beta: 'number', randomMin: 'number', randomMax: 'number',
    styleAdvantage: 'number', calibrationStyle: 'string', homeLossFactor: 'number', lossBands: [{ minRatio: 'number', rate: 'number' }],
  },
  fans: { capacity: 'number', minDeploy: 'number', maxDeploy: 'number', naturalCapacityPerDay: 'number', attackCooldownMinutes: 'number', formationSlots: 'number', dailyActionLimit: 'nullable-number' },
  score: { attackWinBase: 'number', attackLoss: 'number', holdPerHourBase: 'number', nodeMultipliers: nodeNumbers, defenderPersonalWinBase: 'number', defenderPersonalLoss: 'number', defenderPersonalDailyCap: 'number' },
  supply: { adDailyLimit: 'number', diamondUsdRate: 'nullable-number', offers: [{
    id: 'string', label: 'string', mode: 'string', usdCost: 'number', diamondCost: 'number', adCost: 'number', immediateCapacityRate: 'number',
    pulseCapacityRates: [{ afterMinutes: 'number', rate: 'number' }], continuousCapacityRate: 'number', durationMinutes: 'number', fixedFans: 'number', dailyPurchaseLimit: 'nullable-number',
  }] },
  season: { days: 'number', centerUnlockDay: 'number', nodeCounts: nodeNumbers },
  guilds: [{ id: 'string', name: 'string', roster: tierNumbers, purchasePolicies: { normal: policy, small: policy, whale: policy }, deployFans: nodeNumbers, priorities: nodeNumbers }],
  rewards: rewardShape,
  simulation: { runs: 'number', seed: 'number', maxEventsPerDay: 'number' },
}
const analysisShape: Shape = {
  targetGuildId: 'string', targetTier: 'string', targetNodes: nodeNumbers, sensitivityParameter: 'string', sensitivityMetric: 'string', sweepMin: 'number', sweepMax: 'number', sweepStep: 'number',
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Decode every nested member before invoking domain code. Copy known fields only.
function decode(value: unknown, shape: Shape): unknown {
  if (typeof shape === 'string') {
    if (shape === 'nullable-number' && value === null) return null
    const type = shape === 'nullable-number' ? 'number' : shape
    if (typeof value !== type || (type === 'number' && !Number.isFinite(value))) throw new Error('Invalid scalar')
    return value
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new Error('Invalid array')
    return value.map(item => decode(item, shape[0]))
  }
  if (!record(value)) throw new Error('Invalid object')
  return Object.fromEntries(Object.entries(shape).map(([key, member]) => [key, decode(value[key], member)]))
}

function migrateScenario(value: unknown): unknown {
  if (!record(value)) return value
  const scenario = structuredClone(value)
  if (scenario.rewards === undefined) scenario.rewards = structuredClone(DEFAULT_REWARD_CONFIG)
  if (record(scenario.battle) && scenario.battle.formulas === undefined) scenario.battle.formulas = structuredClone(DEFAULT_BATTLE_FORMULAS)
  const supply = scenario.supply
  const season = scenario.season
  if (record(supply) && record(supply.purchasePolicies)) {
    if (!record(season) || typeof season.days !== 'number' || typeof supply.adDailyLimit !== 'number' || !Array.isArray(scenario.guilds)) throw new Error('Invalid legacy scenario')
    const days = season.days
    const adDailyLimit = supply.adDailyLimit
    const oldPolicies = supply.purchasePolicies
    const policies = Object.fromEntries(['normal', 'small', 'whale'].map(tier => {
      const old = oldPolicies[tier]
      if (!record(old) || typeof old.dailyUsdBudget !== 'number' || typeof old.dailyDiamondBudget !== 'number' || typeof old.useAds !== 'boolean' || !Array.isArray(old.supplyPriority)) throw new Error('Invalid legacy policy')
      return [tier, {
        versionUsdBudget: old.dailyUsdBudget * days,
        versionDiamondBudget: old.dailyDiamondBudget * days,
        versionAdBudget: old.useAds ? adDailyLimit * days : 0,
        useAds: old.useAds, supplyPriority: structuredClone(old.supplyPriority),
      }]
    }))
    scenario.guilds = scenario.guilds.map(guild => {
      if (!record(guild)) throw new Error('Invalid legacy guild')
      return { ...guild, purchasePolicies: structuredClone(policies) }
    })
    delete supply.purchasePolicies
  }
  return scenario
}

function decodeScenario(value: unknown): Scenario {
  const scenario = decode(migrateScenario(value), scenarioShape) as Scenario
  if (scenario.guilds.length === 0 || scenario.supply.offers.some(offer => !['program', 'instant'].includes(offer.mode))) throw new Error('Invalid scenario catalog')
  return scenario
}

function decodeAnalysis(value: unknown, scenario: Scenario, legacy: boolean): SimulatorAnalysis {
  if (value === undefined && legacy) return createDefaultAnalysis(scenario)
  const selections = record(value) ? {
    ...value,
    targetGuildId: typeof value.targetGuildId === 'string' ? value.targetGuildId : scenario.guilds[0]?.id ?? '',
    targetTier: typeof value.targetTier === 'string' ? value.targetTier : 'whale',
  } : value
  const analysis = decode(selections, analysisShape) as SimulatorAnalysis
  if (!scenario.guilds.some(guild => guild.id === analysis.targetGuildId)) analysis.targetGuildId = scenario.guilds[0]?.id ?? ''
  if (!['normal', 'small', 'whale'].includes(analysis.targetTier)) analysis.targetTier = 'whale'
  if (legacy && String(analysis.sensitivityParameter) === 'supply.dailyUsdBudget') analysis.sensitivityParameter = 'supply.versionUsdBudget'
  if (!['battle.alpha', 'battle.beta', 'battle.closeLossRate', 'score.coreMultiplier', 'score.centerMultiplier', 'supply.versionUsdBudget'].includes(analysis.sensitivityParameter)
    || !['battleThreeWinProbability', 'finalScoreGap', 'firstPlaceProbability', 'finalNodeCount', 'incrementalScorePerUsd'].includes(analysis.sensitivityMetric)) throw new Error('Invalid analysis choice')
  return analysis
}

export function loadPersistedSimulatorState(storage: SimulatorStorage): LoadResult {
  let state: SimulatorState | undefined
  let notice: string | null = null
  let raw: string | null = null
  let recoveryRaw: string | null = null
  let damaged = false
  try { recoveryRaw = storage.getItem(RECOVERY_KEY) } catch { notice = '本地存储无法读取，模拟仍可继续。' }
  try {
    raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const data: unknown = JSON.parse(raw)
      if (!record(data) || ![undefined, 1, 2, 3].includes(data.schemaVersion as number | undefined)) throw new Error('Unsupported envelope')
      const legacy = data.schemaVersion !== 3
      if (!legacy && (typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt)))) damaged = true
      const appliedInput = legacy ? data.appliedScenario ?? data.lastValidScenario ?? data.scenario ?? data.draft : data.appliedScenario
      const draftInput = legacy ? data.draftScenario ?? data.draft ?? data.scenario ?? appliedInput : data.draftScenario
      try { state = createSimulatorState(decodeScenario(appliedInput)) } catch { damaged = true }
      state ??= createSimulatorState(DEFAULT_SCENARIO)
      let draft = state.appliedScenario
      try { draft = decodeScenario(draftInput) } catch { damaged = true }
      let analysis = createDefaultAnalysis(draft)
      try { analysis = decodeAnalysis(data.analysis, draft, legacy) } catch { damaged = true }
      const checked = validateDraftScenario(draft)
      const differs = JSON.stringify(draft) !== JSON.stringify(state.appliedScenario)
      state = {
        ...state, ...checked, draftScenario: structuredClone(draft), analysis,
        analysisValidation: validateAnalysis(draft, analysis), revision: differs ? 1 : 0,
        validatedRevision: 0, stale: differs,
      }
      if (differs && checked.validation.valid) state = simulatorReducer(state, { type: 'validate-draft', revision: state.revision })
      else state.validatedRevision = state.revision
    }
  } catch { damaged = raw !== null; notice = '本地方案无法读取，已恢复可运行方案。' }
  state ??= createSimulatorState(DEFAULT_SCENARIO)
  if (damaged && raw !== null) {
    recoveryRaw = raw
    notice = '本地方案部分数据无效，已恢复可运行方案；原始内容保留在恢复备份中。'
    try { storage.setItem(RECOVERY_KEY, raw) } catch { notice += ' 恢复备份无法写入本机，请复制保存。' }
  }
  return { state, notice, recoveryRaw, sourceRaw: raw }
}

export function createPersistedEnvelope(state: Pick<SimulatorState, 'draftScenario' | 'appliedScenario' | 'analysis'>): PersistedEnvelopeV3 {
  return { schemaVersion: 3, savedAt: new Date().toISOString(), draftScenario: structuredClone(state.draftScenario), appliedScenario: structuredClone(state.appliedScenario), analysis: structuredClone(state.analysis) }
}
export function savePersistedSimulatorState(storage: SimulatorStorage, envelope: PersistedEnvelopeV3): string | null {
  try {
    const { schemaVersion, savedAt, draftScenario, appliedScenario, analysis } = envelope
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion, savedAt, draftScenario, appliedScenario, analysis }))
    return null
  } catch { return '本地保存失败（存储不可用或空间不足），当前模拟仍可继续。' }
}
export function resetPersistedSimulatorState(storage: SimulatorStorage): string | null {
  let failed = false
  for (const key of [STORAGE_KEY, RECOVERY_KEY]) {
    try { storage.removeItem(key) } catch { failed = true }
  }
  return failed ? '本地数据清除失败，请检查浏览器存储权限。' : null
}
