export interface SourcePosition {
  line: number
  column: number
  offset: number
}

export class KanbanFormatError extends Error {
  readonly line: number
  readonly column: number
  readonly offset: number
  readonly filename?: string

  constructor(message: string, position: SourcePosition, source: string, filename?: string) {
    const location = filename
      ? `${filename}:${position.line}:${position.column}`
      : `${position.line}:${position.column}`
    super(`${location} - ${message}\n\n${renderCodeFrame(source, position)}`)
    this.name = 'KanbanFormatError'
    this.line = position.line
    this.column = position.column
    this.offset = position.offset
    this.filename = filename
  }
}

function renderCodeFrame(source: string, position: SourcePosition): string {
  const lines = source.split('\n')
  const lineText = lines[position.line - 1] ?? ''
  const gutter = String(position.line)
  const prefix = `  ${gutter} | `
  const pointer = ' '.repeat(prefix.length + Math.max(0, position.column - 1)) + '^'
  return `${prefix}${lineText}\n${pointer}`
}

export interface PropertyNode {
  key: string
  keyPosition: SourcePosition
  value: JsonNode
}

export type JsonNode =
  | { type: 'object'; position: SourcePosition; properties: PropertyNode[] }
  | { type: 'array'; position: SourcePosition; items: JsonNode[] }
  | { type: 'string'; position: SourcePosition; value: string }
  | { type: 'number'; position: SourcePosition; value: number }
  | { type: 'boolean'; position: SourcePosition; value: boolean }
  | { type: 'null'; position: SourcePosition }

// Every JSON export has already been through JSON.parse somewhere upstream,
// which throws messages like "Unexpected token } in JSON at position 4821" -
// a byte offset into a file nobody has open in an editor with an offset
// counter. Parsing it ourselves means every node keeps the line and column
// it came from, so downstream validation can point straight at the source.
class Cursor {
  private index = 0
  private line = 1
  private column = 1

  constructor(private readonly text: string) {}

  get position(): SourcePosition {
    return { line: this.line, column: this.column, offset: this.index }
  }

  peek(): string {
    return this.text[this.index] ?? ''
  }

  atEnd(): boolean {
    return this.index >= this.text.length
  }

  advance(): string {
    const ch = this.text[this.index] ?? ''
    this.index += 1
    if (ch === '\n') {
      this.line += 1
      this.column = 1
    } else {
      this.column += 1
    }
    return ch
  }

  skipWhitespace(): void {
    while (!this.atEnd() && /\s/.test(this.peek())) {
      this.advance()
    }
  }
}

export function parseJsonDocument(source: string, filename?: string): JsonNode {
  const cursor = new Cursor(source)

  function fail(message: string, position: SourcePosition = cursor.position): never {
    throw new KanbanFormatError(message, position, source, filename)
  }

  function parseValue(): JsonNode {
    cursor.skipWhitespace()
    if (cursor.atEnd()) fail('unexpected end of input, expected a value')
    const ch = cursor.peek()
    if (ch === '{') return parseObject()
    if (ch === '[') return parseArray()
    if (ch === '"') return parseString()
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber()
    if (source.startsWith('true', cursor.position.offset)) return parseKeyword('true', true)
    if (source.startsWith('false', cursor.position.offset)) return parseKeyword('false', false)
    if (source.startsWith('null', cursor.position.offset)) return parseKeyword('null', null)
    return fail(
      `unexpected character '${ch}', expected a value (object, array, string, number, boolean, or null)`
    )
  }

  function parseKeyword(word: string, value: boolean | null): JsonNode {
    const position = cursor.position
    for (let i = 0; i < word.length; i += 1) {
      if (cursor.peek() !== word[i]) fail(`unexpected character, expected the literal '${word}'`)
      cursor.advance()
    }
    return value === null ? { type: 'null', position } : { type: 'boolean', position, value }
  }

  function parseObject(): JsonNode {
    const position = cursor.position
    cursor.advance() // consume '{'
    const properties: PropertyNode[] = []
    cursor.skipWhitespace()
    if (cursor.peek() === '}') {
      cursor.advance()
      return { type: 'object', position, properties }
    }
    for (;;) {
      cursor.skipWhitespace()
      if (cursor.peek() !== '"') {
        fail(`expected a quoted property name, found '${cursor.peek() || 'end of input'}'`)
      }
      const keyPosition = cursor.position
      const keyNode = parseString()
      cursor.skipWhitespace()
      if (cursor.peek() !== ':') {
        fail(`expected ':' after property name "${keyNode.value}"`)
      }
      cursor.advance()
      const value = parseValue()
      properties.push({ key: keyNode.value, keyPosition, value })
      cursor.skipWhitespace()
      const next = cursor.peek()
      if (next === ',') {
        cursor.advance()
        continue
      }
      if (next === '}') {
        cursor.advance()
        break
      }
      fail(`expected ',' or '}' after property value, found '${next || 'end of input'}'`)
    }
    return { type: 'object', position, properties }
  }

  function parseArray(): JsonNode {
    const position = cursor.position
    cursor.advance() // consume '['
    const items: JsonNode[] = []
    cursor.skipWhitespace()
    if (cursor.peek() === ']') {
      cursor.advance()
      return { type: 'array', position, items }
    }
    for (;;) {
      items.push(parseValue())
      cursor.skipWhitespace()
      const next = cursor.peek()
      if (next === ',') {
        cursor.advance()
        continue
      }
      if (next === ']') {
        cursor.advance()
        break
      }
      fail(`expected ',' or ']' after array element, found '${next || 'end of input'}'`)
    }
    return { type: 'array', position, items }
  }

  function parseString(): JsonNode & { type: 'string' } {
    const position = cursor.position
    cursor.advance() // consume opening quote
    let value = ''
    for (;;) {
      if (cursor.atEnd()) fail('unterminated string literal', position)
      const ch = cursor.advance()
      if (ch === '"') break
      if (ch === '\\') {
        const escape = cursor.advance()
        switch (escape) {
          case '"':
            value += '"'
            break
          case '\\':
            value += '\\'
            break
          case '/':
            value += '/'
            break
          case 'b':
            value += '\b'
            break
          case 'f':
            value += '\f'
            break
          case 'n':
            value += '\n'
            break
          case 'r':
            value += '\r'
            break
          case 't':
            value += '\t'
            break
          case 'u': {
            let hex = ''
            for (let i = 0; i < 4; i += 1) hex += cursor.advance()
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`invalid unicode escape '\\u${hex}'`)
            value += String.fromCharCode(parseInt(hex, 16))
            break
          }
          default:
            fail(`invalid escape sequence '\\${escape}'`)
        }
        continue
      }
      value += ch
    }
    return { type: 'string', position, value }
  }

  function parseNumber(): JsonNode & { type: 'number' } {
    const position = cursor.position
    let text = ''
    if (cursor.peek() === '-') text += cursor.advance()
    if (cursor.peek() === '0') {
      text += cursor.advance()
    } else if (cursor.peek() >= '1' && cursor.peek() <= '9') {
      while (cursor.peek() >= '0' && cursor.peek() <= '9') text += cursor.advance()
    } else {
      fail('expected a digit after minus sign')
    }
    if (cursor.peek() === '.') {
      text += cursor.advance()
      if (!(cursor.peek() >= '0' && cursor.peek() <= '9')) fail('expected a digit after decimal point')
      while (cursor.peek() >= '0' && cursor.peek() <= '9') text += cursor.advance()
    }
    if (cursor.peek() === 'e' || cursor.peek() === 'E') {
      text += cursor.advance()
      if (cursor.peek() === '+' || cursor.peek() === '-') text += cursor.advance()
      if (!(cursor.peek() >= '0' && cursor.peek() <= '9')) fail('expected a digit in exponent')
      while (cursor.peek() >= '0' && cursor.peek() <= '9') text += cursor.advance()
    }
    return { type: 'number', position, value: Number(text) }
  }

  const result = parseValue()
  cursor.skipWhitespace()
  if (!cursor.atEnd()) {
    fail(`unexpected trailing content '${cursor.peek()}' after document`)
  }
  return result
}
