# kanban-export-lint

Most kanban tools let you export a board as JSON. The moment that file gets
hand-edited, migrated between tools, or produced by a buggy script, something
goes wrong: a card points at a list that no longer exists, a required field
is missing, a comma is misplaced. Feed that into `JSON.parse` and you get
`Unexpected token } in JSON at position 4821` - a byte offset into a file
that's open in your editor showing line numbers, not byte offsets.

This library parses the export itself, keeping track of the line and column
of every value as it goes, and validates the result against a normalized
board shape (`lists` + `cards`). Every error it throws - a JSON syntax
mistake or a card referencing an undefined list - points at the exact line
and column in the source file, with a code frame.

## Install

No package has been published yet. Copy `src/` into your project or add it
as a local dependency once this is on a registry.

## Usage

```ts
import { parseBoard } from 'kanban-export-lint'
import { readFileSync } from 'node:fs'

const source = readFileSync('export.json', 'utf8')
const board = parseBoard(source, 'export.json')

console.log(board.lists) // [{ id: 'todo', name: 'To Do' }, ...]
console.log(board.cards) // [{ id: 'card-1', title: '...', listId: 'todo', position: 0 }, ...]
```

Given this export:

```json
{
  "lists": [
    { "id": "todo", "name": "To Do" },
    { "id": "doing", "name": "In Progress" },
    { "id": "done", "name": "Done" }
  ],
  "cards": [
    { "listId": "todo", "id": "card-1", "title": "Write onboarding docs", "position": 0 },
    { "listId": "review", "id": "card-2", "title": "Fix login bug", "position": 1 }
  ]
}
```

`parseBoard` throws:

```
export.json:9:17 - card "Fix login bug" references list "review", which is not defined in "lists" (known list ids: todo, doing, done)

  9 |     { "listId": "review", "id": "card-2", "title": "Fix login bug", "position": 1 }
                      ^
```

A plain syntax mistake gets the same treatment. A stray trailing comma:

```json
{ "lists": [], "cards": [
  { "id": "card-1", "listId": "todo", "title": "x", "position": 0 },
] }
```

produces:

```
export.json:3:1 - unexpected character ']', expected a value (object, array, string, number, boolean, or null)
```

pointing at the closing `]` where a value was expected instead, rather than
a generic "unexpected token" with no location.

## Development

```
npm test
```

runs the suite with node's built-in test runner (`node --test`). There's no
test framework dependency - `tsconfig.test.json` compiles `src` and `test`
together to a scratch directory and `node --test` runs the result.

## Why not just use `JSON.parse`

`JSON.parse` is faster and it's fine for well-formed input, but it only
reports a character offset and stops at the first problem with no structure
to attach further validation to. This library parses into a small AST where
every object property, array item, and primitive value carries its own
source position, so validation logic (missing fields, dangling references,
duplicate ids) can report a location just as precisely as syntax errors do.

## Status

Early. The supported shape is intentionally small: a board is a flat list of
lists and a flat list of cards referencing them by id. Import from the
export formats of specific tools (Trello, Jira, GitHub Projects, etc.) is
not implemented yet - `parseBoard` expects that normalized shape already.

## License

MIT, see [LICENSE](LICENSE).
