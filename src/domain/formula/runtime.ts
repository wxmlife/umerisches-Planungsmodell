import { formulaError } from './types'
import type { BoundNode, CompiledFormula, FormulaErrorCode, FormulaErrorContext, FormulaErrorPhase, FormulaValue } from './types'

// Analytic P(A * U > D * V), for independent U,V uniform on [min,max].
// Preserve the original power gap and roll width before normalizing them;
// subtracting separately rounded ratios loses adjacent-double differences.
function uniformProbability(attacker: number, defender: number, min: number, max: number): number {
  if (defender === 0) return attacker > 0 ? 1 : 0
  if (attacker === 0) return 0
  if (attacker === defender) return 0.5
  const attackerStronger = attacker > defender
  const weaker = attackerStronger ? defender : attacker
  const stronger = attackerStronger ? attacker : defender
  const ratio = weaker / stronger
  const relativeGap = (stronger - weaker) / stronger
  const width = max - min
  // overlap = (weaker * max - stronger * min) / (stronger * width),
  // rearranged to avoid overflowing products and cancellation near ratio=1.
  const overlap = ratio - relativeGap * (min / width)
  if (overlap <= 0) return attackerStronger ? 1 : 0
  // Both factors are in [0,1]; this order also avoids squaring tiny values.
  const weakerWinProbability = 0.5 * overlap * (overlap / ratio)
  return attackerStronger ? 1 - weakerWinProbability : weakerWinProbability
}

export function evaluateFormula(
  program: CompiledFormula,
  variables: Record<string, FormulaValue>,
  context: FormulaErrorContext = 'deterministic',
): number {
  // Only own data properties enter the fixed slots. No getter or prototype
  // property is read during binding or evaluation; unused slots may be absent.
  const slots: unknown[] = program.variableSchema.map(({ name }) => {
    const descriptor = Object.getOwnPropertyDescriptor(variables, name)
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined
  })

  function fail(code: FormulaErrorCode, node: BoundNode, phase: FormulaErrorPhase = 'runtime'): never {
    const error = formulaError(program.formulaId, phase, code, node.range, context)
    const snapshot: Record<string, FormulaValue> = {}
    program.variableSchema.forEach(({ name, type }, index) => {
      const value = slots[index]
      if (typeof value === type && (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) snapshot[name] = value
    })
    error.variables = snapshot
    throw error
  }

  function power(base: number, exponent: number, node: BoundNode): number {
    if ((base < 0 && !Number.isInteger(exponent)) || (base === 0 && exponent < 0)) fail('FUNCTION_DOMAIN', node)
    return Math.pow(base, exponent)
  }

  function call(node: Extract<BoundNode, { kind: 'call' }>): number {
    const args = node.arguments.map((argument) => evaluate(argument) as number)
    const [first, second, third, fourth] = args
    switch (node.name) {
      case 'pow': return power(first, second, node)
      case 'sqrt':
        if (first < 0) fail('FUNCTION_DOMAIN', node)
        return Math.sqrt(first)
      case 'abs': return Math.abs(first)
      case 'min': return Math.min(...args)
      case 'max': return Math.max(...args)
      case 'clamp':
        if (second > third) fail('FUNCTION_DOMAIN', node)
        return Math.min(third, Math.max(second, first))
      case 'round': return Math.round(first)
      case 'floor': return Math.floor(first)
      case 'ceil': return Math.ceil(first)
      case 'log':
        if (first <= 0) fail('FUNCTION_DOMAIN', node)
        return Math.log(first)
      case 'exp': return Math.exp(first)
      case 'uniformWinProbability':
        if (first < 0 || second < 0 || third <= 0 || fourth <= third) fail('FUNCTION_DOMAIN', node)
        return uniformProbability(first, second, third, fourth)
      default: return fail('UNKNOWN_IDENTIFIER', node)
    }
  }

  function binary(node: Extract<BoundNode, { kind: 'binary' }>): FormulaValue {
    const left = evaluate(node.left)
    if (node.operator === '&&') return left === false ? false : evaluate(node.right)
    if (node.operator === '||') return left === true ? true : evaluate(node.right)
    const right = evaluate(node.right)
    if (node.operator === '==') return left === right
    if (node.operator === '!=') return left !== right
    // Static validation guarantees numeric types for the remaining operators.
    const a = left as number
    const b = right as number
    switch (node.operator) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/':
      case '%':
        if (b === 0) fail('DIVIDE_BY_ZERO', node)
        return node.operator === '/' ? a / b : a % b
      case '^': return power(a, b, node)
      case '<': return a < b
      case '<=': return a <= b
      case '>': return a > b
      case '>=': return a >= b
    }
  }

  function visit(node: BoundNode): FormulaValue {
    switch (node.kind) {
      case 'literal': return node.value
      case 'slot': {
        const value = slots[node.slot]
        if (typeof value !== program.variableSchema[node.slot].type) fail('TYPE_MISMATCH', node)
        return value as FormulaValue
      }
      case 'unary': {
        const operand = evaluate(node.operand)
        if (node.operator === '!') return !operand
        return node.operator === '-' ? -(operand as number) : operand
      }
      case 'binary': return binary(node)
      case 'conditional': return evaluate(node.condition) ? evaluate(node.consequent) : evaluate(node.alternate)
      case 'call': return call(node)
    }
  }

  function evaluate(node: BoundNode): FormulaValue {
    const value = visit(node)
    if (typeof value === 'number' && !Number.isFinite(value)) fail('NON_FINITE', node)
    return value
  }

  const result = evaluate(program.root) as number
  const maximum = program.formulaId === 'preRandomPower' ? 1e15
    : program.formulaId === 'fanLoss' ? Number.MAX_VALUE : 1
  if (result < 0 || result > maximum) fail('OUTPUT_RANGE', program.root, 'output')
  return result
}
