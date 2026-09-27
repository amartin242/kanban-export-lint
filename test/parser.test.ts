import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonDocument, KanbanFormatError, type JsonNode } from '../src/parser'

function asObject(node: JsonNode) {
  assert.equal(node.type, 'object')
  return node as Extract<JsonNode, { type: 'object' }>
}

function captureError(fn: () => void): KanbanFormatError {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof KanbanFormatError)
    return error
  }
  throw new Error('expected fn to throw a KanbanFormatError')
}

test('parses primitives with their source position', () => {
  const doc = asObject(parseJsonDocument('{\n  "a": 1\n}'))
  assert.equal(doc.properties.length, 1)
  const prop = doc.properties[0]
  assert.equal(prop.key, 'a')
  assert.deepEqual(prop.keyPosition, { line: 2, column: 3, offset: 4 })
  assert.equal(prop.value.type, 'number')
  assert.equal((prop.value as Extract<JsonNode, { type: 'number' }>).value, 1)
  assert.deepEqual(prop.value.position, { line: 2, column: 8, offset: 9 })
})

test('parses nested arrays and objects', () => {
  const doc = asObject(parseJsonDocument('{ "items": [1, 2, {"n": null}, true, "x"] }'))
  const items = doc.properties[0].value
  assert.equal(items.type, 'array')
  const list = (items as Extract<JsonNode, { type: 'array' }>).items
  assert.equal(list.length, 5)
  assert.equal(list[0].type, 'number')
  assert.equal(list[2].type, 'object')
  assert.equal(list[3].type, 'boolean')
  assert.equal(list[4].type, 'string')
})

test('reports the exact location of a trailing comma', () => {
  const source = [
    '{ "lists": [], "cards": [',
    '  { "id": "card-1", "listId": "todo", "title": "x", "position": 0 },',
    '] }',
  ].join('\n')

  const error = captureError(() => parseJsonDocument(source))
  assert.equal(error.line, 3)
  assert.equal(error.column, 1)
  assert.match(error.message, /unexpected character '\]'/)
})

test('reports the location of an unterminated string', () => {
  const error = captureError(() => parseJsonDocument('{ "a": "unterminated }'))
  assert.equal(error.line, 1)
  assert.equal(error.column, 8)
  assert.match(error.message, /unterminated string literal/)
})

test('reports the location of an invalid escape sequence', () => {
  const error = captureError(() => parseJsonDocument('{ "a": "bad \\q escape" }'))
  assert.match(error.message, /invalid escape sequence '\\q'/)
})

test('rejects trailing content after a complete document', () => {
  const error = captureError(() => parseJsonDocument('{} {}'))
  assert.match(error.message, /unexpected trailing content/)
})

test('rejects a bare property name without quotes', () => {
  const error = captureError(() => parseJsonDocument('{ id: 1 }'))
  assert.match(error.message, /expected a quoted property name/)
})

test('code frame points a caret at the offending column', () => {
  const error = captureError(() => parseJsonDocument('{ "a": tru }'))
  assert.equal(error.line, 1)
  assert.equal(error.column, 8)
  const lines = error.message.split('\n')
  const gutterLine = lines[lines.length - 2]
  const caretLine = lines[lines.length - 1]
  assert.equal(caretLine.trimStart(), '^')
  // the caret's index in its own line lines up with the 't' it points at
  assert.equal(caretLine.length - 1, gutterLine.indexOf('t'))
})
