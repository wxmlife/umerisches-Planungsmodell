import { describe, expect, it } from 'vitest'
import { buildBattleDetail } from '../battleDetail'

describe('spreadsheet battle detail', () => {
  it('renders five rounds with five independent idol matchup states', () => {
    const rows = buildBattleDetail({ attackerIdolPower: 100_000, defenderIdolPower: 400_000, attackerInitialFans: 1_000, defenderInitialFans: 1_000, seed: 7 })
    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.idolRolls.length === 5 && row.idolMatchups.length === 5)).toBe(true)
    expect(rows[0].attackerFans).toBe(1000)
    expect(rows.at(-1)!.defenderFans).toBeLessThan(1000)
  })
})
