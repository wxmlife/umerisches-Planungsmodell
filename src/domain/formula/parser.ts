import { formulaError } from './types'
import type { BinaryOperator, FormulaId, SourceRange, SyntaxNode, UnaryOperator } from './types'

interface Token { text: string; kind: 'number' | 'identifier' | 'symbol' | 'end'; range: SourceRange }

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/
const SYMBOL = /^(?:\|\||&&|==|!=|<=|>=|[?:+\-*/%^!<>(),])/

const syntaxCache = new Map<string, SyntaxNode>()

class Parser {
  private index = 0
  private readonly tokens: Token[] = []
  private nodeCount = 0
  private readonly depths = new WeakMap<SyntaxNode, number>()
  private readonly formulaId: FormulaId

  constructor(source: string, formulaId: FormulaId) {
    this.formulaId = formulaId
    if (source.length > 512) throw formulaError(formulaId, 'parse', 'SOURCE_TOO_LONG', { start: 512, end: source.length })
    let offset = 0
    while (offset < source.length) {
      const rest = source.slice(offset)
      const whitespace = /^\s+/.exec(rest)
      if (whitespace) { offset += whitespace[0].length; continue }
      const number = NUMBER.exec(rest)
      const identifier = number ? null : IDENTIFIER.exec(rest)
      const symbol = number || identifier ? null : SYMBOL.exec(rest)
      const text = (number ?? identifier ?? symbol)?.[0]
      if (!text) throw formulaError(formulaId, 'parse', 'UNEXPECTED_TOKEN', { start: offset, end: offset + 1 })
      this.tokens.push({ text, kind: number ? 'number' : identifier ? 'identifier' : 'symbol', range: Object.freeze({ start: offset, end: offset + text.length }) })
      offset += text.length
    }
    this.tokens.push({ text: '', kind: 'end', range: Object.freeze({ start: offset, end: offset }) })
  }

  private get token(): Token { return this.tokens[this.index] }

  private take(text: string): boolean {
    if (this.token.text !== text) return false
    this.index++
    return true
  }

  private expect(text: string): void {
    if (!this.take(text)) this.unexpected()
  }

  private unexpected(): never {
    throw formulaError(this.formulaId, 'parse', 'UNEXPECTED_TOKEN', this.token.range)
  }

  private node(node: SyntaxNode, children: readonly SyntaxNode[] = []): SyntaxNode {
    const depth = 1 + Math.max(0, ...children.map((child) => this.depths.get(child)!))
    if (++this.nodeCount > 128 || depth > 24) throw formulaError(this.formulaId, 'parse', 'AST_LIMIT', node.range)
    this.depths.set(node, depth)
    Object.freeze(node.range)
    return Object.freeze(node)
  }

  parse(): SyntaxNode {
    const result = this.conditional()
    if (this.token.kind !== 'end') this.unexpected()
    return result
  }

  private conditional(): SyntaxNode {
    const condition = this.logicalOr()
    if (!this.take('?')) return condition
    const consequent = this.conditional()
    this.expect(':')
    const alternate = this.conditional()
    return this.node({ kind: 'conditional', condition, consequent, alternate, range: { start: condition.range.start, end: alternate.range.end } }, [condition, consequent, alternate])
  }

  private chain(next: () => SyntaxNode, operators: readonly BinaryOperator[]): SyntaxNode {
    let left = next()
    while (operators.includes(this.token.text as BinaryOperator)) {
      const operator = this.token.text as BinaryOperator
      this.index++
      const right = next()
      left = this.node({ kind: 'binary', operator, left, right, range: { start: left.range.start, end: right.range.end } }, [left, right])
    }
    return left
  }

  private logicalOr = (): SyntaxNode => this.chain(this.logicalAnd, ['||'])
  private logicalAnd = (): SyntaxNode => this.chain(this.equality, ['&&'])
  private equality = (): SyntaxNode => this.chain(this.comparison, ['==', '!='])
  private comparison = (): SyntaxNode => this.chain(this.additive, ['<', '<=', '>', '>='])
  private additive = (): SyntaxNode => this.chain(this.multiplicative, ['+', '-'])
  private multiplicative = (): SyntaxNode => this.chain(this.unary, ['*', '/', '%'])

  private unary = (): SyntaxNode => {
    const token = this.token
    if (['+', '-', '!'].includes(token.text)) {
      this.index++
      const operand = this.unary()
      return this.node({ kind: 'unary', operator: token.text as UnaryOperator, operand, range: { start: token.range.start, end: operand.range.end } }, [operand])
    }
    return this.power()
  }

  private power(): SyntaxNode {
    const left = this.primary()
    if (!this.take('^')) return left
    const right = this.unary()
    return this.node({ kind: 'binary', operator: '^', left, right, range: { start: left.range.start, end: right.range.end } }, [left, right])
  }

  private primary(): SyntaxNode {
    const token = this.token
    if (this.take('(')) {
      const expression = this.conditional()
      this.expect(')')
      return expression
    }
    if (token.kind === 'number') {
      this.index++
      return this.node({ kind: 'literal', value: Number(token.text), range: token.range })
    }
    if (token.kind !== 'identifier') this.unexpected()
    this.index++
    if (token.text === 'true' || token.text === 'false') return this.node({ kind: 'literal', value: token.text === 'true', range: token.range })
    if (!this.take('(')) return this.node({ kind: 'identifier', name: token.text, range: token.range })
    const args: SyntaxNode[] = []
    if (this.token.text !== ')') {
      do { args.push(this.conditional()) } while (this.take(','))
    }
    const end = this.token.range.end
    this.expect(')')
    return this.node({ kind: 'call', name: token.text, arguments: Object.freeze(args), range: { start: token.range.start, end } }, args)
  }
}

export function parseFormulaSource(source: string, formulaId: FormulaId = 'preRandomPower'): SyntaxNode {
  const cached = syntaxCache.get(source)
  if (cached) {
    syntaxCache.delete(source)
    syntaxCache.set(source, cached)
    return cached
  }
  const parsed = new Parser(source, formulaId).parse()
  syntaxCache.set(source, parsed)
  if (syntaxCache.size > 128) syntaxCache.delete(syntaxCache.keys().next().value!)
  return parsed
}
