export interface BattleFormulaConfig {
  preRandomPower: string
  displayedTendency: string
  winProbability: string
  fanLoss: string
}

export type FormulaId = keyof BattleFormulaConfig
export type FormulaValue = number | boolean
export type FormulaValueType = 'number' | 'boolean'
export type FormulaErrorPhase = 'parse' | 'typecheck' | 'runtime' | 'output'
export type FormulaErrorCode =
  | 'UNEXPECTED_TOKEN' | 'SOURCE_TOO_LONG' | 'AST_LIMIT' | 'UNKNOWN_IDENTIFIER'
  | 'TYPE_MISMATCH' | 'INVALID_ARITY' | 'DIVIDE_BY_ZERO' | 'FUNCTION_DOMAIN'
  | 'NON_FINITE' | 'OUTPUT_RANGE'
export type FormulaErrorContext = 'draft-validation' | 'deterministic' | 'monte-carlo' | 'sensitivity'

export interface SourceRange { readonly start: number; readonly end: number }

export interface FormulaErrorDto {
  kind: 'formula'
  formulaId: FormulaId
  phase: FormulaErrorPhase
  code: FormulaErrorCode
  message: string
  context: FormulaErrorContext
  range?: SourceRange
  variables?: Record<string, FormulaValue>
}

const ERROR_MESSAGES: Record<FormulaErrorCode, string> = {
  UNEXPECTED_TOKEN: '公式包含意外或不支持的符号。',
  SOURCE_TOO_LONG: '公式不能超过 512 个字符。',
  AST_LIMIT: '公式不能超过 128 个节点或 24 层深度。',
  UNKNOWN_IDENTIFIER: '公式使用了未声明的变量或函数。',
  TYPE_MISMATCH: '公式的值类型不符合要求。',
  INVALID_ARITY: '函数的参数数量不符合要求。',
  DIVIDE_BY_ZERO: '公式不能除以零或对零取余。',
  FUNCTION_DOMAIN: '函数的参数超出了允许范围。',
  NON_FINITE: '公式产生了非有限数值。',
  OUTPUT_RANGE: '公式结果超出了允许范围。',
}

export function formulaError(
  formulaId: FormulaId,
  phase: FormulaErrorPhase,
  code: FormulaErrorCode,
  range?: SourceRange,
  context: FormulaErrorContext = 'draft-validation',
): FormulaErrorDto {
  return { kind: 'formula', formulaId, phase, code, message: ERROR_MESSAGES[code], context, ...(range ? { range } : {}) }
}

export type UnaryOperator = '+' | '-' | '!'
export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '^' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||'

type ExpressionNode<Reference> = { readonly range: SourceRange } & (
  | { readonly kind: 'literal'; readonly value: FormulaValue }
  | Reference
  | { readonly kind: 'unary'; readonly operator: UnaryOperator; readonly operand: ExpressionNode<Reference> }
  | { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: ExpressionNode<Reference>; readonly right: ExpressionNode<Reference> }
  | { readonly kind: 'conditional'; readonly condition: ExpressionNode<Reference>; readonly consequent: ExpressionNode<Reference>; readonly alternate: ExpressionNode<Reference> }
  | { readonly kind: 'call'; readonly name: string; readonly arguments: readonly ExpressionNode<Reference>[] }
)

export type SyntaxNode = ExpressionNode<{ readonly kind: 'identifier'; readonly name: string }>
export type BoundNode = ExpressionNode<{ readonly kind: 'slot'; readonly slot: number }>

export interface VariableDefinition { readonly name: string; readonly type: FormulaValueType }

export interface CompiledFormula {
  readonly formulaId: FormulaId
  readonly source: string
  readonly variableSchemaVersion: number
  readonly root: BoundNode
  readonly variableSchema: readonly VariableDefinition[]
  readonly referencedVariables: readonly string[]
}

// Increment when any whitelist, constant, signature, or slot order changes.
export const VARIABLE_SCHEMA_VERSION = 1

const schema = (...entries: readonly (string | readonly [string, FormulaValueType])[]): readonly VariableDefinition[] => Object.freeze(
  entries.map((entry) => Object.freeze(typeof entry === 'string' ? { name: entry, type: 'number' as const } : { name: entry[0], type: entry[1] })),
)

export const VARIABLE_SCHEMAS: Readonly<Record<FormulaId, readonly VariableDefinition[]>> = Object.freeze({
  preRandomPower: schema('idolPower', 'initialFans', 'currentFans', 'styleMultiplier', 'alpha', 'beta'),
  displayedTendency: schema('attackerPower', 'defenderPower'),
  winProbability: schema('attackerPower', 'defenderPower', 'randomMin', 'randomMax'),
  fanLoss: schema('currentFans', 'attackerToDefenderPowerRatio', 'lossBandRate', 'sideLossFactor', ['attackerWon', 'boolean'], ['isDefender', 'boolean']),
})

// Reconstruct the transport DTO: never forward arbitrary messages, stacks,
// non-finite variables, or extra exception fields across the Worker boundary.
export function normalizeFormulaError(error: unknown, context: FormulaErrorContext): FormulaErrorDto | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as Record<string, unknown>
  if (candidate.kind !== 'formula'
    || typeof candidate.formulaId !== 'string' || !Object.hasOwn(VARIABLE_SCHEMAS, candidate.formulaId)
    || typeof candidate.code !== 'string' || !Object.hasOwn(ERROR_MESSAGES, candidate.code)
    || typeof candidate.phase !== 'string' || !['parse', 'typecheck', 'runtime', 'output'].includes(candidate.phase)) return undefined
  const dto = formulaError(candidate.formulaId as FormulaId, candidate.phase as FormulaErrorPhase, candidate.code as FormulaErrorCode, undefined, context)
  const range = candidate.range as SourceRange | undefined
  if (range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end >= range.start) {
    dto.range = { start: range.start, end: range.end }
  }
  if (candidate.variables && typeof candidate.variables === 'object') {
    dto.variables = {}
    for (const { name, type } of VARIABLE_SCHEMAS[dto.formulaId]) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate.variables, name)
      const value: unknown = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined
      if (typeof value === type && (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) dto.variables[name] = value
    }
  }
  return dto
}

export const FUNCTION_SIGNATURES = Object.freeze({
  pow: Object.freeze([2, 2]), sqrt: Object.freeze([1, 1]), abs: Object.freeze([1, 1]),
  min: Object.freeze([2, 8]), max: Object.freeze([2, 8]), clamp: Object.freeze([3, 3]),
  round: Object.freeze([1, 1]), floor: Object.freeze([1, 1]), ceil: Object.freeze([1, 1]),
  log: Object.freeze([1, 1]), exp: Object.freeze([1, 1]), uniformWinProbability: Object.freeze([4, 4]),
})

export const FORMULA_CONSTANTS = Object.freeze({ PI: Math.PI, E: Math.E })
