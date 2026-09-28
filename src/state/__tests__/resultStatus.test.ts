import { describe, expect, it } from 'vitest'
import { resultStatusMessage } from '../resultStatus'

describe('resultStatusMessage', () => {
  it('does not claim a failed deterministic run is still refreshing', () => {
    expect(resultStatusMessage({
      valid: true,
      stale: true,
      runStatus: 'error',
    })).toBe('基准推演失败：保留并淡化上一次有效结果。')
  })
})
