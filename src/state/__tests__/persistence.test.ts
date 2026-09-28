import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_BATTLE_FORMULAS, DEFAULT_SCENARIO } from '../../domain/defaults'
import { createFormulaScenario } from '../../test/fixtures'
import { createSimulatorState } from '../simulatorReducer'
import { loadPersistedSimulatorState, savePersistedSimulatorState, resetPersistedSimulatorState, createPersistedEnvelope, STORAGE_KEY, RECOVERY_KEY } from '../persistence'

beforeEach(() => localStorage.clear())
const valid = () => createPersistedEnvelope(createSimulatorState(createFormulaScenario()))

describe('local v3 recovery', () => {
  it('round trips only the exact v3 persisted fields and rebuilds results', () => {
    expect(STORAGE_KEY).toBe('alliance-war-simulator/scenario/v3')
    expect(RECOVERY_KEY).toBe('alliance-war-simulator/recovery/latest')
    const envelope = valid()
    expect(savePersistedSimulatorState(localStorage, envelope)).toBeNull()
    expect(Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).sort()).toEqual(['schemaVersion', 'savedAt', 'draftScenario', 'appliedScenario', 'analysis'].sort())
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.appliedScenario).toEqual(envelope.appliedScenario)
    expect(loaded.state.draftScenario).toEqual(envelope.draftScenario)
    expect(loaded.state.pendingScenario).toBeNull()
    expect(loaded.state.deterministic.termination).toBe('season-end')
    expect(loaded.recoveryRaw).toBeNull()
  })
  it('preserves invalid formula draft text while rendering validated applied results', () => {
    const envelope = valid()
    envelope.draftScenario.battle.formulas.fanLoss = 'currentFans +'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.draftScenario.battle.formulas.fanLoss).toBe('currentFans +')
    expect(loaded.state.appliedScenario.battle.formulas.fanLoss).toBe(DEFAULT_BATTLE_FORMULAS.fanLoss)
    expect(loaded.state.validation.valid).toBe(false)
    expect(loaded.state.formulaErrors.fanLoss).toBeDefined()
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
  })
  it('reenters pending for a statically valid different draft on reload', () => {
    const envelope = valid()
    envelope.draftScenario.battle.alpha = 2
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.pendingScenario?.scenario.battle.alpha).toBe(2)
    expect(loaded.state.appliedScenario.battle.alpha).toBe(1.36)
    expect(loaded.state.stale).toBe(true)
  })
  it.each(['', '{broken', '[]', '{"schemaVersion":99}', '{"schemaVersion":3,"draftScenario":{}}', 'null'])('contains malformed payload %j and backs up exact raw text', raw => {
    localStorage.setItem(STORAGE_KEY, raw)
    expect(() => loadPersistedSimulatorState(localStorage)).not.toThrow()
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.appliedScenario).toEqual(DEFAULT_SCENARIO)
    expect(localStorage.getItem(RECOVERY_KEY)).toBe(raw)
    expect(loaded.notice).toBeTruthy()
  })
  it('falls back from runtime-invalid applied and retains a separately decodable draft', () => {
    const envelope = valid()
    envelope.appliedScenario.battle.formulas.winProbability = '1 / 0'
    envelope.draftScenario.battle.formulas.fanLoss = 'broken +'
    const raw = JSON.stringify(envelope)
    localStorage.setItem(STORAGE_KEY, raw)
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.appliedScenario).toEqual(DEFAULT_SCENARIO)
    expect(loaded.state.draftScenario.battle.formulas.fanLoss).toBe('broken +')
    expect(loaded.recoveryRaw).toBe(raw)
  })
  it('rejects partial nested structures safely while recovering intact applied data', () => {
    const envelope = valid()
    const data = JSON.parse(JSON.stringify(envelope))
    delete data.draftScenario.guilds[0].purchasePolicies.whale
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.draftScenario).toEqual(envelope.appliedScenario)
    expect(loaded.state.appliedScenario).toEqual(envelope.appliedScenario)
    expect(loaded.recoveryRaw).toBeTruthy()
  })
  it('migrates legacy policies, budget units, formulas, lastValidScenario and analysis selection', () => {
    const old = JSON.parse(JSON.stringify(createFormulaScenario()))
    delete old.battle.formulas
    old.supply.purchasePolicies = Object.fromEntries(['normal', 'small', 'whale'].map(tier => [tier, { dailyUsdBudget: 2.5, dailyDiamondBudget: 10, useAds: tier === 'normal', supplyPriority: ['flyer'] }]))
    old.season.days = 6
    old.guilds.forEach((guild: Record<string, unknown>) => { delete guild.purchasePolicies })
    const envelope = valid()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 2, draft: old, lastValidScenario: old, analysis: { ...envelope.analysis, targetGuildId: 'missing', targetTier: 'missing', sensitivityParameter: 'supply.dailyUsdBudget' } }))
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.appliedScenario.battle.formulas).toEqual(DEFAULT_BATTLE_FORMULAS)
    expect(loaded.state.appliedScenario.guilds[0].purchasePolicies.normal).toEqual({ versionUsdBudget: 15, versionDiamondBudget: 60, versionAdBudget: old.supply.adDailyLimit * 6, useAds: true, supplyPriority: ['flyer'] })
    expect(loaded.state.appliedScenario.guilds[1].purchasePolicies.whale.versionAdBudget).toBe(0)
    expect(loaded.state.appliedScenario.guilds[0].purchasePolicies).not.toBe(loaded.state.appliedScenario.guilds[1].purchasePolicies)
    expect(loaded.state.appliedScenario.supply).not.toHaveProperty('purchasePolicies')
    expect(loaded.state.analysis).toMatchObject({ targetGuildId: 'A', targetTier: 'whale', sensitivityParameter: 'supply.versionUsdBudget' })
  })
  it('validates restored analysis numbers rather than accepting a bad sweep', () => {
    const envelope = valid()
    envelope.analysis.sweepStep = 0
    envelope.analysis.targetNodes.normal = -1
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    expect(loadPersistedSimulatorState(localStorage).state.analysisValidation.valid).toBe(false)
  })
  it('falls back missing target selections without discarding the rest of analysis', () => {
    const data = JSON.parse(JSON.stringify(valid()))
    delete data.analysis.targetGuildId
    delete data.analysis.targetTier
    data.analysis.sweepStep = 0
    data.analysis.sweepMax = 72
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    const loaded = loadPersistedSimulatorState(localStorage)
    expect(loaded.state.analysis).toMatchObject({ targetGuildId: 'A', targetTier: 'whale', sweepStep: 0, sweepMax: 72 })
    expect(loaded.state.analysisValidation.valid).toBe(false)
  })
  it('catches storage errors and resets both exact keys', () => {
    const broken = { getItem() { throw Error('access') }, setItem() { throw Error('quota') }, removeItem() { throw Error('access') } }
    expect(() => loadPersistedSimulatorState(broken)).not.toThrow()
    expect(savePersistedSimulatorState(broken, valid())).toBeTruthy()
    expect(resetPersistedSimulatorState(broken)).toBeTruthy()
    localStorage.setItem(STORAGE_KEY, 'main')
    localStorage.setItem(RECOVERY_KEY, 'backup')
    expect(resetPersistedSimulatorState(localStorage)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
  })
})
