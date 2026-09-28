import { render, screen } from '@testing-library/react'
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
})
