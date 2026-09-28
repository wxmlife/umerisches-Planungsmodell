import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../../domain/defaults'
import { createSeededRng } from '../../domain/rng'
import { runSeason } from '../../domain/season'
import { RankingPanel } from '../RankingPanel'

describe('RankingPanel', () => {
  it('renders numeric rankings and keeps calibration targets presentation-only', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(1), 'deterministic')
    render(<RankingPanel scenario={DEFAULT_SCENARIO} deterministic={result} />)
    expect(screen.getByRole('heading', { name: '最终排名' })).toBeVisible()
    for (const guild of DEFAULT_SCENARIO.guilds) {
      expect(screen.getByText(guild.name)).toBeVisible()
    }
    expect(screen.getByText(/A\/C.*\+30%/)).toBeVisible()
    expect(screen.getByText(/A\/B.*\+60%/)).toBeVisible()
    expect(screen.getByText(/A\/D.*\+120%/)).toBeVisible()
  })
})
