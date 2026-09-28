import { parseFormulaSource } from './parser'
import { FORMULA_CONSTANTS, FUNCTION_SIGNATURES, VARIABLE_SCHEMAS, VARIABLE_SCHEMA_VERSION, formulaError } from './types'
import type { BoundNode, CompiledFormula, FormulaId, FormulaValueType, SyntaxNode } from './types'

const programCache = new Map<string, CompiledFormula>()

export function compileFormula(formulaId: FormulaId, source: string): CompiledFormula {
  const cacheKey = JSON.stringify([formulaId, source, VARIABLE_SCHEMA_VERSION])
  const cached = programCache.get(cacheKey)
  if (cached) {
    programCache.delete(cacheKey)
    programCache.set(cacheKey, cached)
    return cached
  }
  const root = parseFormulaSource(source, formulaId)
  const variableSchema = VARIABLE_SCHEMAS[formulaId]
  const referencedVariables = new Set<string>()

  function bind(node: SyntaxNode): { node: BoundNode; type: FormulaValueType } {
    const mismatch = (): never => { throw formulaError(formulaId, 'typecheck', 'TYPE_MISMATCH', node.range) }
    const result = (bound: BoundNode, type: FormulaValueType) => ({ node: Object.freeze(bound), type })
    switch (node.kind) {
      case 'literal': return result(node, typeof node.value as FormulaValueType)
      case 'identifier': {
        if (Object.hasOwn(FORMULA_CONSTANTS, node.name)) return result({ kind: 'literal', value: FORMULA_CONSTANTS[node.name as keyof typeof FORMULA_CONSTANTS], range: node.range }, 'number')
        const slot = variableSchema.findIndex((variable) => variable.name === node.name)
        if (slot < 0) throw formulaError(formulaId, 'typecheck', 'UNKNOWN_IDENTIFIER', node.range)
        referencedVariables.add(node.name)
        return result({ kind: 'slot', slot, range: node.range }, variableSchema[slot].type)
      }
      case 'unary': {
        const operand = bind(node.operand)
        const type = node.operator === '!' ? 'boolean' : 'number'
        if (operand.type !== type) mismatch()
        return result({ ...node, operand: operand.node }, type)
      }
      case 'binary': {
        const left = bind(node.left)
        const right = bind(node.right)
        const equality = node.operator === '==' || node.operator === '!='
        const logical = node.operator === '&&' || node.operator === '||'
        if (equality ? left.type !== right.type : left.type !== (logical ? 'boolean' : 'number') || right.type !== left.type) mismatch()
        const type = equality || logical || ['<', '<=', '>', '>='].includes(node.operator) ? 'boolean' : 'number'
        return result({ ...node, left: left.node, right: right.node }, type)
      }
      case 'conditional': {
        const condition = bind(node.condition)
        const consequent = bind(node.consequent)
        const alternate = bind(node.alternate)
        if (condition.type !== 'boolean' || consequent.type !== alternate.type) mismatch()
        return result({ ...node, condition: condition.node, consequent: consequent.node, alternate: alternate.node }, consequent.type)
      }
      case 'call': {
        if (!Object.hasOwn(FUNCTION_SIGNATURES, node.name)) throw formulaError(formulaId, 'typecheck', 'UNKNOWN_IDENTIFIER', node.range)
        const [min, max] = FUNCTION_SIGNATURES[node.name as keyof typeof FUNCTION_SIGNATURES]
        if (node.arguments.length < min || node.arguments.length > max) throw formulaError(formulaId, 'typecheck', 'INVALID_ARITY', node.range)
        const args = node.arguments.map(bind)
        if (args.some((argument) => argument.type !== 'number')) mismatch()
        return result({ ...node, arguments: Object.freeze(args.map((argument) => argument.node)) }, 'number')
      }
    }
  }

  const bound = bind(root)
  if (bound.type !== 'number') throw formulaError(formulaId, 'typecheck', 'TYPE_MISMATCH', root.range)
  const program = Object.freeze({ formulaId, source, variableSchemaVersion: VARIABLE_SCHEMA_VERSION, root: bound.node, variableSchema, referencedVariables: Object.freeze([...referencedVariables]) })
  programCache.set(cacheKey, program)
  if (programCache.size > 128) programCache.delete(programCache.keys().next().value!)
  return program
}
