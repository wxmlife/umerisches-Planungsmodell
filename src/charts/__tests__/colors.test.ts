import { describe, expect, it } from 'vitest'
import { resolveGuildColors, resolveSemanticColor } from '../colors'

describe('stable identity colors', () => {
  it.each([
    ['A', '#57A8FF', '#2F7ED7', '#8CC8FF'],
    ['B', '#F3C665', '#C79425', '#F8D98F'],
    ['C', '#EF7AA8', '#CF4E82', '#F6A7C5'],
    ['D', '#7DD7C4', '#43AD98', '#A5E4D7'],
  ])('resolves the fixed main, attack, and holding identity of %s', (id, main, attack, holding) => {
    expect(resolveGuildColors(id)).toEqual({ main, attack, holding })
  })

  it.each([
    ['alpha', '#7DD7C4', '#43AD98', '#A5E4D7'],
    ['é', '#F3C665', '#C79425', '#F8D98F'],
    ['联盟', '#F3C665', '#C79425', '#F8D98F'],
    ['未知商品', '#F97316', '#C2410C', '#FDBA74'],
  ])('uses unsigned UTF-8 FNV-1a for unknown ID %s', (id, main, attack, holding) => {
    expect(resolveGuildColors(id)).toEqual({ main, attack, holding })
  })

  it('keeps unknown guild colors stable when resolution order changes', () => {
    const ids = ['alpha', '联盟', '未知商品']
    const before = Object.fromEntries(ids.map((id) => [id, resolveGuildColors(id)]))
    const after = Object.fromEntries(ids.toReversed().map((id) => [id, resolveGuildColors(id)]))
    expect(after).toEqual(before)
  })

  it.each([
    ['tier', 'normal', '#7DD7C4'],
    ['tier', 'small', '#F3C665'],
    ['tier', 'whale', '#EF7AA8'],
    ['offer', 'ad-or-diamond-ad', '#7DD7C4'],
    ['offer', 'ad-or-diamond-diamond', '#57A8FF'],
    ['offer', 'flyer', '#F3C665'],
    ['offer', 'cheer-stick', '#EF7AA8'],
    ['offer', 'instant-600', '#8CC8FF'],
    ['offer', 'instant-1000', '#A78BFA'],
    ['offer', 'instant-2000', '#F59E0B'],
  ] as const)('resolves the fixed %s color for %s', (namespace, id, color) => {
    expect(resolveSemanticColor(namespace, id)).toBe(color)
  })

  it('uses the stable identity fallback for unknown semantic IDs without leaking namespaces', () => {
    expect(resolveSemanticColor('offer', '未知商品')).toBe('#F97316')
    expect(resolveSemanticColor('tier', '未知商品')).toBe('#F97316')
    expect(resolveSemanticColor('offer', 'normal')).toBe('#EF7AA8')
  })
})
