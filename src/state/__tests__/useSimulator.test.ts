import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFormulaScenario } from '../../test/fixtures'
import { createSimulatorState } from '../simulatorReducer'
import { createPersistedEnvelope, STORAGE_KEY, RECOVERY_KEY } from '../persistence'
import { useSimulator } from '../useSimulator'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(createPersistedEnvelope(createSimulatorState(createFormulaScenario()))))
})
afterEach(() => vi.useRealTimers())
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)

describe('simulator effects', () => {
  it('saves invalid draft text after exactly 300 ms and restores it without changing applied results', async () => {
    const { result, unmount } = renderHook(() => useSimulator())
    act(() => result.current.setString('battle.formulas.fanLoss', 'currentFans +'))
    await advance(299)
    expect(saved().draftScenario.battle.formulas.fanLoss).not.toBe('currentFans +')
    expect(result.current.state.formulaErrors.fanLoss).toBeUndefined()
    await advance(1)
    expect(saved().draftScenario.battle.formulas.fanLoss).toBe('currentFans +')
    expect(result.current.state.formulaErrors.fanLoss).toBeDefined()
    expect(saved().appliedScenario.battle.formulas.fanLoss).toBe('round(currentFans * lossBandRate * sideLossFactor)')
    unmount()
    const restored = renderHook(() => useSimulator())
    expect(restored.result.current.state.draftScenario.battle.formulas.fanLoss).toBe('currentFans +')
    expect(restored.result.current.state.validation.valid).toBe(false)
    expect(restored.result.current.state.deterministic.termination).toBe('season-end')
  })

  it('immediately saves a successful application and applies formula-backed calibration atomically', async () => {
    const { result } = renderHook(() => useSimulator())
    act(() => result.current.setString('battle.formulas.winProbability', '0'))
    await advance(300)
    expect(result.current.state.pendingScenario).not.toBeNull()
    expect(result.current.state.appliedScenario.battle.formulas.winProbability).not.toBe('0')
    await advance(1)
    expect(result.current.state.pendingScenario).toBeNull()
    expect(result.current.state.appliedScenario.battle.formulas.winProbability).toBe('0')
    expect(result.current.state.calibration.equalFans.every(row => row.actualWinProbability === 0)).toBe(true)
    expect(saved().appliedScenario.battle.formulas.winProbability).toBe('0')
    expect(saved()).not.toHaveProperty('pendingScenario')
    expect(saved()).not.toHaveProperty('deterministic')
  })

  it('retains complete prior results when a statically valid formula fails at runtime', async () => {
    const { result } = renderHook(() => useSimulator())
    const prior = result.current.state
    act(() => result.current.setString('battle.formulas.winProbability', '1 / 0'))
    await advance(300)
    await advance(1)
    expect(result.current.state.appliedScenario).toBe(prior.appliedScenario)
    expect(result.current.state.deterministic).toBe(prior.deterministic)
    expect(result.current.state.calibration).toBe(prior.calibration)
    expect(result.current.state.pendingScenario).toBeNull()
    expect(result.current.state.formulaErrors.winProbability?.code).toBe('DIVIDE_BY_ZERO')
    expect(saved().draftScenario.battle.formulas.winProbability).toBe('1 / 0')
    expect(saved().appliedScenario.battle.formulas.winProbability).not.toBe('1 / 0')
  })

  it('backs up an exact restored payload when its valid-looking draft fails its first run', async () => {
    const envelope = saved()
    envelope.draftScenario.battle.formulas.winProbability = '1 / 0'
    const raw = JSON.stringify(envelope)
    localStorage.setItem(STORAGE_KEY, raw)
    const { result } = renderHook(() => useSimulator())
    await advance(1)
    expect(localStorage.getItem(RECOVERY_KEY)).toBe(raw)
    expect(result.current.recoveryRaw).toBe(raw)
    expect(result.current.state.appliedScenario.battle.formulas.winProbability).not.toBe('1 / 0')
  })

  it('debounces analysis persistence and cancels pending saves and runs on reset', async () => {
    const { result } = renderHook(() => useSimulator())
    act(() => result.current.setAnalysisNumber('sweepMax', 72))
    await advance(299)
    expect(saved().analysis.sweepMax).toBe(120)
    await advance(1)
    expect(saved().analysis.sweepMax).toBe(72)
    act(() => result.current.setString('battle.formulas.fanLoss', 'currentFans +'))
    localStorage.setItem(RECOVERY_KEY, 'backup')
    await advance(100)
    act(() => result.current.resetDefaults())
    await advance(1000)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
    expect(result.current.state.stale).toBe(false)
  })
})
