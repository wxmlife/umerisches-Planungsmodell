import { describe, expect, it } from 'vitest'
import { SAMPLE_MONTE_CARLO_RESULT } from '../../test/fixtures'
import { buildScoreOption } from '../options'

describe('chart option builders', () => {
  it('builds a P10 to P90 band around the median', () => {
    const option = buildScoreOption(SAMPLE_MONTE_CARLO_RESULT)
    const names = option.series.map((series) => series.name)
    expect(names).toContain('A 中位数')
    expect(names).toContain('A P10–P90')
    expect(option.series.find((series) => series.name === 'A P10–P90')?.data)
      .toEqual([[0, 20]])
  })
})
