import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBoard } from '../src/board'
import { KanbanFormatError } from '../src/parser'

function captureError(fn: () => void): KanbanFormatError {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof KanbanFormatError)
    return error
  }
  throw new Error('expected fn to throw a KanbanFormatError')
}

const VALID_EXPORT = `{
  "lists": [
    { "id": "todo", "name": "To Do" },
    { "id": "doing", "name": "In Progress" }
  ],
  "cards": [
    { "id": "card-1", "title": "Write onboarding docs", "listId": "todo", "position": 0 },
    { "id": "card-2", "title": "Fix login bug", "listId": "doing", "position": 1 }
  ]
}`

test('parses a well-formed export into a normalized board', () => {
  const board = parseBoard(VALID_EXPORT)
  assert.deepEqual(board.lists, [
    { id: 'todo', name: 'To Do' },
    { id: 'doing', name: 'In Progress' },
  ])
  assert.deepEqual(board.cards, [
    { id: 'card-1', title: 'Write onboarding docs', listId: 'todo', position: 0 },
    { id: 'card-2', title: 'Fix login bug', listId: 'doing', position: 1 },
  ])
})

test('rejects a document whose root is not an object', () => {
  const error = captureError(() => parseBoard('[]'))
  assert.match(error.message, /expected the export to be a JSON object/)
})

test('rejects a missing "lists" property', () => {
  const error = captureError(() => parseBoard('{ "cards": [] }'))
  assert.match(error.message, /missing required property "lists"/)
})

test('rejects a missing "cards" property', () => {
  const error = captureError(() => parseBoard('{ "lists": [] }'))
  assert.match(error.message, /missing required property "cards"/)
})

test('rejects a card missing a required field', () => {
  const source = `{
  "lists": [{ "id": "todo", "name": "To Do" }],
  "cards": [{ "id": "card-1", "title": "x", "listId": "todo" }]
}`
  const error = captureError(() => parseBoard(source))
  assert.match(error.message, /card "x" is missing required property "position"/)
})

test('rejects a card pointing at an undefined list', () => {
  const source = `{
  "lists": [{ "id": "todo", "name": "To Do" }],
  "cards": [
    { "id": "card-1", "title": "Fix login bug", "listId": "review", "position": 0 }
  ]
}`
  const error = captureError(() => parseBoard(source))
  assert.match(
    error.message,
    /card "Fix login bug" references list "review", which is not defined in "lists" \(known list ids: todo\)/
  )
})

test('rejects duplicate list ids', () => {
  const source = `{
  "lists": [
    { "id": "todo", "name": "To Do" },
    { "id": "todo", "name": "Also To Do" }
  ],
  "cards": []
}`
  const error = captureError(() => parseBoard(source))
  assert.match(error.message, /duplicate list id "todo" \(first defined at line 3, column 13\)/)
})

test('rejects a non-string list id', () => {
  const source = `{
  "lists": [{ "id": 1, "name": "To Do" }],
  "cards": []
}`
  const error = captureError(() => parseBoard(source))
  assert.match(error.message, /expected lists\[0\].id to be a string, found a number/)
})

test('reports the filename in the error location when one is given', () => {
  const error = captureError(() => parseBoard('{ "cards": [] }', 'export.json'))
  assert.match(error.message, /^export\.json:1:1 - missing required property "lists"/)
})
