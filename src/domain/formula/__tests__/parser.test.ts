import { describe, expect, it } from 'vitest'
import { compileFormula } from '../compiler'
import { parseFormulaSource } from '../parser'
import type { FormulaId, SyntaxNode } from '../types'

// Tree shapes assert the EBNF independently of the numeric evaluator.
function shape(node: SyntaxNode): unknown {
  switch (node.kind) {
    case 'literal': return node.value
    case 'identifier': return node.name
    case 'unary': return [node.operator, shape(node.operand)]
    case 'binary': return [node.operator, shape(node.left), shape(node.right)]
    case 'conditional': return ['?:', shape(node.condition), shape(node.consequent), shape(node.alternate)]
    case 'call': return [node.name, ...node.arguments.map(shape)]
  }
}

function compilationError(source: string, formulaId: FormulaId = 'fanLoss') {
  try {
    compileFormula(formulaId, source)
    expect.fail('Expected the invalid formula to be rejected')
  } catch (error) {
    return error
  }
}

describe('formula grammar', () => {
  it.each([
    ['1 + 2 * 3 ^ 4', ['+', 1, ['*', 2, ['^', 3, 4]]]],
    ['-2^2', ['-', ['^', 2, 2]]],
    ['(-2)^2', ['^', ['-', 2], 2]],
    ['2^-2^3', ['^', 2, ['-', ['^', 2, 3]]]],
    ['8 / 4 * 2 % 3', ['%', ['*', ['/', 8, 4], 2], 3]],
    ['8 - 4 + 2', ['+', ['-', 8, 4], 2]],
    ['1 < 2 <= 3 > 4 >= 5', ['>=', ['>', ['<=', ['<', 1, 2], 3], 4], 5]],
    ['1 == 2 != 3', ['!=', ['==', 1, 2], 3]],
    ['1 + 2 < 4 == true && false || true', ['||', ['&&', ['==', ['<', ['+', 1, 2], 4], true], false], true]],
    ['true || false || true', ['||', ['||', true, false], true]],
    ['true && false && true', ['&&', ['&&', true, false], true]],
    ['true ? 1 : false ? 2 : 3', ['?:', true, 1, ['?:', false, 2, 3]]],
    ['true ? false ? 1 : 2 : 3', ['?:', true, ['?:', false, 1, 2], 3]],
    ['! !true ? +.5e+2 : 1.E-2', ['?:', ['!', ['!', true]], ['+', 50], 0.01]],
    ['min(1, max(2, 3))', ['min', 1, ['max', 2, 3]]],
  ])('parses %s with specified precedence and associativity', (source, expected) => {
    expect(shape(parseFormulaSource(source))).toEqual(expected)
  })

  it.each(['', '1e', '1e+', '.', '1 2', '0x10', '1..2', 'min(1,)', '(1', '1)', 'true ? 1', 'true ? : 1'])('rejects malformed syntax: %s', (source) => {
    expect(compilationError(source)).toMatchObject({ kind: 'formula', formulaId: 'fanLoss', phase: 'parse', code: 'UNEXPECTED_TOKEN' })
  })

  it.each(['currentFans = 1', 'Math.pow(2, 2)', 'currentFans.x', '1; 2', '1 // comment', '1 /* comment */', '"hello"', "'hello'", '`hello`', '[1,2]', '{x:1}', 'x => x', 'function f() {}', 'for(;;){}', '1 & 2', '1 | 2', '1 << 2', '~1', '2 ** 3'])('rejects JavaScript constructs: %s', (source) => {
    expect(compilationError(source)).toMatchObject({ phase: 'parse', code: 'UNEXPECTED_TOKEN' })
  })

  it('reports UTF-16 token ranges without echoing source into messages', () => {
    expect(compilationError('  1 + "secret"')).toMatchObject({
      range: { start: 6, end: 7 }, context: 'draft-validation', message: expect.any(String),
    })
    expect(JSON.stringify(compilationError('  1 + "secret"'))).not.toContain('secret')
  })
})

describe('formula static types and schemas', () => {
  it.each([
    ['preRandomPower', 'idolPower + initialFans + currentFans + styleMultiplier + alpha + beta'],
    ['displayedTendency', 'attackerPower + defenderPower'],
    ['winProbability', 'attackerPower + defenderPower + randomMin + randomMax'],
    ['fanLoss', 'attackerWon && !isDefender ? currentFans * lossBandRate * sideLossFactor : attackerToDefenderPowerRatio'],
    ['fanLoss', '(attackerWon ? true : false) == isDefender ? PI : E'],
  ] as const)('accepts only numeric roots and declared %s variables', (formulaId, source) => {
    expect(compileFormula(formulaId, source).formulaId).toBe(formulaId)
  })

  it.each(['NaN', 'Infinity', 'undefined', 'null', 'Date', 'Math', 'window', 'globalThis', 'constructor', '__proto__', 'toString', 'random()', 'sqrt', 'pi', 'CurrentFans', 'unknown(1)'])('rejects undeclared identifier/function %s', (source) => {
    expect(compilationError(source)).toMatchObject({ phase: 'typecheck', code: 'UNKNOWN_IDENTIFIER' })
  })

  it.each([
    ['preRandomPower', 'attackerPower'], ['displayedTendency', 'randomMin'],
    ['winProbability', 'currentFans'], ['fanLoss', 'alpha'],
    ['preRandomPower', 'attackerWon'], ['fanLoss', 'currentFans(1)'],
  ] as const)('enforces %s whitelist for %s', (formulaId, source) => {
    expect(compilationError(source, formulaId)).toMatchObject({ formulaId, phase: 'typecheck', code: 'UNKNOWN_IDENTIFIER' })
  })

  it.each(['true', '1 + true', '-false', '+true', 'true < false', '!1', '1 && true', 'false || 1', '1 ? 2 : 3', 'true ? 1 : false', '1 == true', 'false != 1', '1 < 2 < 3', 'pow(true, 1)'])('rejects implicit conversion or nonnumeric root: %s', (source) => {
    expect(compilationError(source)).toMatchObject({ phase: 'typecheck', code: 'TYPE_MISMATCH' })
  })

  const signatures = [
    ['pow', 2, 2], ['sqrt', 1, 1], ['abs', 1, 1], ['min', 2, 8], ['max', 2, 8],
    ['clamp', 3, 3], ['round', 1, 1], ['floor', 1, 1], ['ceil', 1, 1],
    ['log', 1, 1], ['exp', 1, 1], ['uniformWinProbability', 4, 4],
  ] as const

  it.each(signatures)('checks the complete %s signature', (name, min, max) => {
    for (let count = min; count <= max; count++) {
      expect(() => compileFormula('fanLoss', `${name}(${Array(count).fill('1').join(',')})`)).not.toThrow()
    }
    for (const count of [0, min - 1, max + 1]) {
      expect(compilationError(`${name}(${Array(count).fill('1').join(',')})`)).toMatchObject({ phase: 'typecheck', code: 'INVALID_ARITY' })
    }
    expect(compilationError(`${name}(true${',1'.repeat(min - 1)})`)).toMatchObject({ phase: 'typecheck', code: 'TYPE_MISMATCH' })
  })
})

describe('formula resource limits', () => {
  it('accepts 512 UTF-16 characters and rejects 513', () => {
    expect(() => compileFormula('fanLoss', '1'.padEnd(512))).not.toThrow()
    expect(compilationError('1'.padEnd(513))).toMatchObject({ phase: 'parse', code: 'SOURCE_TOO_LONG' })
  })

  const tree = (leaves: number): string => leaves === 1 ? '1' : `(${tree(Math.floor(leaves / 2))}+${tree(Math.ceil(leaves / 2))})`
  it('accepts exactly 128 AST nodes and rejects 129', () => {
    expect(() => compileFormula('fanLoss', `+${tree(64)}`)).not.toThrow()
    expect(compilationError(tree(65))).toMatchObject({ phase: 'parse', code: 'AST_LIMIT' })
  })

  it('accepts AST depth 24 and rejects 25, including left-deep chains', () => {
    expect(() => compileFormula('fanLoss', `${'+'.repeat(23)}1`)).not.toThrow()
    expect(compilationError(`${'+'.repeat(24)}1`)).toMatchObject({ phase: 'parse', code: 'AST_LIMIT' })
    expect(compilationError(Array(25).fill('1').join('+'))).toMatchObject({ phase: 'parse', code: 'AST_LIMIT' })
    expect(() => compileFormula('fanLoss', `${'('.repeat(100)}1${')'.repeat(100)}`)).not.toThrow()
  })
})
