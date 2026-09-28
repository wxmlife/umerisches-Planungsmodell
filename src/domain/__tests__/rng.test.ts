import { expect, it } from 'vitest'
import { createSeededRng } from '../rng'

it('replays the same random stream for the same seed', () => {
  const a = createSeededRng(20260924)
  const b = createSeededRng(20260924)
  expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
})

it('keeps generated values inside the half-open unit interval', () => {
  const rng = createSeededRng(-17)
  for (let index = 0; index < 100; index += 1) {
    const value = rng.next()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
  }
})
