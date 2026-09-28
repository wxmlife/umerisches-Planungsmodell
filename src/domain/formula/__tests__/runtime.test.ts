import { describe, expect, it, vi } from 'vitest'
import { uniformWinProbability as legacyUniformWinProbability } from '../../battle'
import { compileFormula } from '../compiler'
import * as parser from '../parser'
import { evaluateFormula } from '../runtime'
import type { FormulaErrorContext, FormulaId, FormulaValue } from '../types'

function value(source: string, variables: Record<string, FormulaValue> = {}, formulaId: FormulaId = 'fanLoss') {
  return evaluateFormula(compileFormula(formulaId, source), variables)
}

function runtimeError(source: string, variables: Record<string, FormulaValue> = {}, formulaId: FormulaId = 'fanLoss', context?: FormulaErrorContext) {
  try {
    evaluateFormula(compileFormula(formulaId, source), variables, context)
    expect.fail('Expected a formula error')
  } catch (error) { return error }
}

describe('formula evaluation', () => {
  it.each([
    ['10 + -2^2', 6], ['(-2)^2', 4], ['2^3^2', 512], ['2^-2', 0.25],
    ['8 / 4 * 2 % 3', 1], ['8 - 4 + 2', 6], ['.5e+2 + 1.E-2', 50.01],
    ['pow(3, 2)', 9], ['sqrt(9)', 3], ['abs(-3)', 3], ['min(4,2,3)', 2],
    ['max(4,2,3)', 4], ['clamp(5,0,3)', 3], ['clamp(-1,0,3)', 0],
    ['round(1.5)', 2], ['floor(1.9)', 1], ['ceil(1.1)', 2], ['log(E)', 1],
    ['exp(0)', 1], ['PI', Math.PI], ['pow(0,0)', 1],
    ['true ? false ? 1 : 2 : 3', 2], ['false ? 1 : true ? 2 : 3', 2],
    ['1 <= 1 && 2 >= 1 && 1 < 2 && 2 > 1 ? 7 : 9', 7],
    ['true == true && false != true && 1 == 1 && 1 != 2 ? 8 : 9', 8],
    ['!false && true || false ? +3 : 4', 3],
  ])('evaluates %s', (source, expected) => {
    expect(value(source)).toBe(expected)
  })

  it('binds formula-specific numeric and boolean values to fixed slots', () => {
    expect(value('attackerWon && !isDefender ? currentFans * lossBandRate * sideLossFactor : attackerToDefenderPowerRatio', {
      currentFans: 100, lossBandRate: 0.1, sideLossFactor: 0.5, attackerToDefenderPowerRatio: 3, attackerWon: true, isDefender: false,
    })).toBe(5)
    expect(value('idolPower + initialFans + currentFans + styleMultiplier + alpha + beta', {
      beta: 6, alpha: 5, styleMultiplier: 4, currentFans: 3, initialFans: 2, idolPower: 1,
    }, 'preRandomPower')).toBe(21)
  })

  it.each([
    ['false && 1 / 0 > 0 ? 1 : 2', 2], ['true || 1 % 0 > 0 ? 1 : 2', 1],
    ['true ? 3 : sqrt(-1)', 3], ['false ? exp(1000) : 4', 4],
    ['false ? 1e999 : 5', 5], ['true ? 6 : currentFans', 6],
  ])('only evaluates selected branches in %s', (source, expected) => {
    expect(value(source)).toBe(expected)
  })

  it.each(['true && 1 / 0 > 0 ? 1 : 2', 'false || 1 % 0 > 0 ? 1 : 2', 'false ? 1 : 1/0'])('still evaluates a selected failing branch: %s', (source) => {
    expect(runtimeError(source)).toMatchObject({ phase: 'runtime', code: 'DIVIDE_BY_ZERO' })
  })
})

describe('runtime errors and output contracts', () => {
  it.each(['1/0', '0/0', '1/-0', '1%0', '1%-0'])('rejects division/modulo by zero: %s', (source) => {
    expect(runtimeError(source)).toMatchObject({ kind: 'formula', phase: 'runtime', code: 'DIVIDE_BY_ZERO', formulaId: 'fanLoss', context: 'deterministic' })
  })

  it.each(['sqrt(-1)', 'log(0)', 'log(-1)', 'pow(-1,0.5)', '(-1)^0.5', 'pow(0,-1)', '0^-1', 'clamp(1,3,2)',
    'uniformWinProbability(-1,1,0.9,1.1)', 'uniformWinProbability(1,-1,0.9,1.1)',
    'uniformWinProbability(1,1,0,1)', 'uniformWinProbability(1,1,-1,1)',
    'uniformWinProbability(1,1,1,1)', 'uniformWinProbability(1,1,2,1)',
    'uniformWinProbability(0,0,1,1)',
  ])('rejects invalid function domains: %s', (source) => {
    expect(runtimeError(source)).toMatchObject({ phase: 'runtime', code: 'FUNCTION_DOMAIN' })
  })

  it.each(['1e999', 'exp(1000)', 'pow(1e308,2)', '1e308 * 2', '1e308 + 1e308', '-1e308 - 1e308', '1 / 1e-320', '(1e308 * 2) * 0', 'min(1e308 * 2, 1)'])('rejects nonfinite intermediates/output: %s', (source) => {
    expect(runtimeError(source)).toMatchObject({ phase: 'runtime', code: 'NON_FINITE' })
  })

  it.each([
    ['preRandomPower', '-1'], ['preRandomPower', '1e15 + 1'],
    ['displayedTendency', '-0.01'], ['displayedTendency', '1.01'],
    ['winProbability', '-0.01'], ['winProbability', '1.01'], ['fanLoss', '-1'],
  ] as const)('enforces %s output range for %s', (formulaId, source) => {
    expect(runtimeError(source, {}, formulaId)).toMatchObject({ phase: 'output', code: 'OUTPUT_RANGE', formulaId })
  })

  it.each([
    ['preRandomPower', '0', 0], ['preRandomPower', '1e15', 1e15],
    ['displayedTendency', '0', 0], ['displayedTendency', '1', 1],
    ['winProbability', '0', 0], ['winProbability', '1', 1], ['fanLoss', '0', 0],
    ['fanLoss', 'currentFans + 200.75', 210.75],
  ] as const)('accepts %s contract boundary %s without rounding/capping', (formulaId, source, expected) => {
    expect(value(source, { currentFans: 10 }, formulaId)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite runtime input %s', (currentFans) => {
    expect(runtimeError('currentFans', { currentFans })).toMatchObject({ phase: 'runtime', code: 'NON_FINITE' })
  })

  it('rejects missing/wrong-type variables, inherited properties and accessors', () => {
    expect(runtimeError('currentFans')).toMatchObject({ phase: 'runtime', code: 'TYPE_MISMATCH' })
    expect(runtimeError('currentFans', { currentFans: true })).toMatchObject({ phase: 'runtime', code: 'TYPE_MISMATCH' })
    expect(runtimeError('attackerWon ? 1 : 2', { attackerWon: 1 })).toMatchObject({ phase: 'runtime', code: 'TYPE_MISMATCH' })
    expect(runtimeError('currentFans', Object.create({ currentFans: 4 }))).toMatchObject({ phase: 'runtime', code: 'TYPE_MISMATCH' })
    const getter = vi.fn(() => 4)
    expect(runtimeError('currentFans', Object.defineProperty({}, 'currentFans', { get: getter }))).toMatchObject({ phase: 'runtime', code: 'TYPE_MISMATCH' })
    expect(getter).not.toHaveBeenCalled()
  })

  it('returns bounded cloneable errors with selected context and whitelisted finite scalars', () => {
    const variables = { currentFans: 100, attackerWon: true, sideLossFactor: Infinity, secret: 123, source: 'private' } as unknown as Record<string, FormulaValue>
    const error = runtimeError('currentFans / 0', variables, 'fanLoss', 'monte-carlo')
    expect(error).toEqual({
      kind: 'formula', formulaId: 'fanLoss', phase: 'runtime', code: 'DIVIDE_BY_ZERO',
      message: expect.any(String), context: 'monte-carlo', range: { start: 0, end: 15 },
      variables: { currentFans: 100, attackerWon: true },
    })
    expect(structuredClone(error)).toEqual(error)
    expect(JSON.parse(JSON.stringify(error))).toEqual(error)
    expect(error).not.toBeInstanceOf(Error)
  })
})

describe('uniform win probability', () => {
  it.each([
    [0, 0, 0], [1, 0, 1], [0, 1, 0], [1, 1, 0.5],
    [0.5, 1, 0.0625], [2, 1, 0.9375], [3, 1, 1], [1, 3, 0],
  ])('returns the analytic result for powers %s, %s', (attackerPower, defenderPower, expected) => {
    expect(value('uniformWinProbability(attackerPower, defenderPower, randomMin, randomMax)', { attackerPower, defenderPower, randomMin: 0.5, randomMax: 1.5 }, 'winProbability')).toBeCloseTo(expected, 14)
  })

  it('matches the previous analytic implementation on a fixed power-ratio grid', () => {
    const program = compileFormula('winProbability', 'uniformWinProbability(attackerPower, defenderPower, randomMin, randomMax)')
    for (const randomBounds of [[0.5, 1.5], [0.9, 1.1], [1, 3]]) {
      const [randomMin, randomMax] = randomBounds
      for (const ratio of [0, 0.01, 0.5, 0.8, 0.9, 0.99, 1, 1.01, 1.1, 1.25, 2, 100]) {
        expect(evaluateFormula(program, { attackerPower: ratio * 100, defenderPower: 100, randomMin, randomMax }))
          .toBeCloseTo(legacyUniformWinProbability(ratio * 100, 100, randomMin, randomMax), 12)
      }
    }
  })

  it.each([
    ['uniformWinProbability(1e308, 1e-300, 0.9, 1.1)', 1],
    ['uniformWinProbability(1e-300, 1e308, 0.9, 1.1)', 0],
    ['uniformWinProbability(1e308, 1e308, 1e300, 1e308)', 0.5],
    ['uniformWinProbability(1, 1, 1, 1.0000000000000002)', 0.5],
  ])('avoids avoidable overflow/cancellation in %s', (source, expected) => {
    expect(value(source)).toBe(expected)
  })
})

describe('bounded, isolated formula caches', () => {
  it('reuses a compiled program without parsing again', () => {
    const parseSpy = vi.spyOn(parser, 'parseFormulaSource')
    try {
      const first = compileFormula('fanLoss', '601.001')
      for (let index = 0; index < 5; index++) expect(compileFormula('fanLoss', '601.001')).toBe(first)
      expect(parseSpy).toHaveBeenCalledTimes(1)
    } finally { parseSpy.mockRestore() }
  })

  it('shares syntax by exact source but validates and binds each formula ID separately', () => {
    const source = 'currentFans + 701.001'
    const syntax = parser.parseFormulaSource(source, 'fanLoss')
    expect(parser.parseFormulaSource(source, 'preRandomPower')).toBe(syntax)
    const loss = compileFormula('fanLoss', source)
    const power = compileFormula('preRandomPower', source)
    expect(power).not.toBe(loss)
    expect(evaluateFormula(loss, { currentFans: 1 })).toBe(702.001)
    expect(evaluateFormula(power, { currentFans: 2 })).toBe(703.001)
    expect(() => compileFormula('displayedTendency', source)).toThrow(expect.objectContaining({ code: 'UNKNOWN_IDENTIFIER', formulaId: 'displayedTendency' }))
    expect(() => compileFormula('winProbability', source)).toThrow(expect.objectContaining({ code: 'UNKNOWN_IDENTIFIER', formulaId: 'winProbability' }))
  })

  it('keeps at most 128 syntax entries and promotes cache hits (LRU)', () => {
    const sources = Array.from({ length: 128 }, (_, index) => `80000 + ${index}`)
    const nodes = sources.map((source) => parser.parseFormulaSource(source))
    expect(parser.parseFormulaSource(sources[0])).toBe(nodes[0])
    parser.parseFormulaSource('80000 + 128')
    expect(parser.parseFormulaSource(sources[0])).toBe(nodes[0])
    expect(parser.parseFormulaSource(sources[1])).not.toBe(nodes[1])
  })

  it('keeps at most 128 program entries and promotes cache hits (LRU)', () => {
    const sources = Array.from({ length: 128 }, (_, index) => `90000 + ${index}`)
    const programs = sources.map((source) => compileFormula('fanLoss', source))
    expect(compileFormula('fanLoss', sources[0])).toBe(programs[0])
    compileFormula('fanLoss', '90000 + 128')
    expect(compileFormula('fanLoss', sources[0])).toBe(programs[0])
    expect(compileFormula('fanLoss', sources[1])).not.toBe(programs[1])
  })

  it('freezes programs and ASTs so a cache consumer cannot alter future results', () => {
    const program = compileFormula('fanLoss', 'min(currentFans, 12)')
    expect(() => Object.assign(program.root, { kind: 'literal', value: 999 })).toThrow()
    expect(() => Object.assign(program.variableSchema[0], { name: 'secret' })).toThrow()
    const syntax = parser.parseFormulaSource('max(11, 12)')
    expect(() => Object.assign(syntax, { kind: 'literal', value: 999 })).toThrow()
    expect(evaluateFormula(compileFormula('fanLoss', 'min(currentFans, 12)'), { currentFans: 10 })).toBe(10)
  })
})
