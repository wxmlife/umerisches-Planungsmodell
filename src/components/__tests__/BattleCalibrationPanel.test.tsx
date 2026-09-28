import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { BattleCalibrationPanel } from '../BattleCalibrationPanel'

describe('BattleCalibrationPanel', () => {
  it('shows both displayed tendency and real probability without verdict labels', () => {
    render(<BattleCalibrationPanel scenario={DEFAULT_SCENARIO} />)
    expect(screen.getByText('46.1%')).toBeVisible()
    expect(screen.getByText(/2\.5%/)).toBeVisible()
    expect(screen.queryByText('碾压')).not.toBeInTheDocument()
    expect(screen.queryByText('劣势')).not.toBeInTheDocument()
  })

  it('renders both approved attrition samples through six attempts', () => {
    render(<BattleCalibrationPanel scenario={DEFAULT_SCENARIO} />)
    expect(screen.getByRole('heading', { name: '连续挑战曲线' })).toBeVisible()
    expect(screen.getByText('1,000 vs 1,000')).toBeVisible()
    expect(screen.getByText('2,000 vs 1,000')).toBeVisible()
  })

  it('uses the editable tier powers and explicit style matchup', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.battle.tierMultipliers.small = 9
    scenario.battle.tierMultipliers.whale = 9
    scenario.battle.calibrationStyle = 'attacker-advantage'
    render(<BattleCalibrationPanel scenario={scenario} />)

    expect(screen.getByText(/小 R ×9.*大 R ×9.*进攻方风格优势/)).toBeVisible()
    const equalFansTable = screen.getByText('1,000 vs 1,000').closest('table')!
    expect(within(equalFansTable).getByText('51.5%')).toBeVisible()
  })
})
