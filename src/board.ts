import { KanbanFormatError, parseJsonDocument, type JsonNode, type PropertyNode, type SourcePosition } from './parser'

export interface BoardList {
  id: string
  name: string
}

export interface BoardCard {
  id: string
  title: string
  listId: string
  position: number
}

export interface Board {
  lists: BoardList[]
  cards: BoardCard[]
}

type ObjectNode = Extract<JsonNode, { type: 'object' }>
type ArrayNode = Extract<JsonNode, { type: 'array' }>
type StringNode = Extract<JsonNode, { type: 'string' }>
type NumberNode = Extract<JsonNode, { type: 'number' }>

function findProperty(obj: ObjectNode, name: string): PropertyNode | undefined {
  return obj.properties.find((p) => p.key === name)
}

/**
 * Parses a kanban board export (a JSON document shaped like
 * `{ "lists": [...], "cards": [...] }`) into a normalized Board.
 *
 * Every failure - a JSON syntax error, a missing field, a card pointing at a
 * list that was never defined - throws a KanbanFormatError with the exact
 * line and column of the offending value plus a code frame, so you never
 * have to guess where in the file to look.
 */
export function parseBoard(source: string, filename?: string): Board {
  const root = parseJsonDocument(source, filename)

  const fail = (message: string, position: SourcePosition): never => {
    throw new KanbanFormatError(message, position, source, filename)
  }

  if (root.type !== 'object') {
    fail(`expected the export to be a JSON object with "lists" and "cards", found a ${root.type}`, root.position)
  }

  const listsProp = findProperty(root, 'lists')
  if (!listsProp) fail('missing required property "lists"', root.position)
  if (listsProp.value.type !== 'array') {
    fail(`expected "lists" to be an array, found a ${listsProp.value.type}`, listsProp.value.position)
  }

  const cardsProp = findProperty(root, 'cards')
  if (!cardsProp) fail('missing required property "cards"', root.position)
  if (cardsProp.value.type !== 'array') {
    fail(`expected "cards" to be an array, found a ${cardsProp.value.type}`, cardsProp.value.position)
  }

  const lists: BoardList[] = []
  const listIdPositions = new Map<string, SourcePosition>()

  ;(listsProp.value as ArrayNode).items.forEach((item, index) => {
    if (item.type !== 'object') {
      fail(`expected lists[${index}] to be an object, found a ${item.type}`, item.position)
    }

    const idProp = findProperty(item, 'id')
    if (!idProp) fail(`lists[${index}] is missing required property "id"`, item.position)
    if (idProp.value.type !== 'string') {
      fail(`expected lists[${index}].id to be a string, found a ${idProp.value.type}`, idProp.value.position)
    }

    const nameProp = findProperty(item, 'name')
    if (!nameProp) fail(`lists[${index}] is missing required property "name"`, item.position)
    if (nameProp.value.type !== 'string') {
      fail(`expected lists[${index}].name to be a string, found a ${nameProp.value.type}`, nameProp.value.position)
    }

    const idNode = idProp.value as StringNode
    const existing = listIdPositions.get(idNode.value)
    if (existing) {
      fail(
        `duplicate list id "${idNode.value}" (first defined at line ${existing.line}, column ${existing.column})`,
        idNode.position
      )
    }
    listIdPositions.set(idNode.value, idNode.position)

    lists.push({ id: idNode.value, name: (nameProp.value as StringNode).value })
  })

  const cards: BoardCard[] = []

  ;(cardsProp.value as ArrayNode).items.forEach((item, index) => {
    if (item.type !== 'object') {
      fail(`expected cards[${index}] to be an object, found a ${item.type}`, item.position)
    }

    const idProp = findProperty(item, 'id')
    if (!idProp) fail(`cards[${index}] is missing required property "id"`, item.position)
    if (idProp.value.type !== 'string') {
      fail(`expected cards[${index}].id to be a string, found a ${idProp.value.type}`, idProp.value.position)
    }

    const titleProp = findProperty(item, 'title')
    if (!titleProp) fail(`cards[${index}] is missing required property "title"`, item.position)
    if (titleProp.value.type !== 'string') {
      fail(`expected cards[${index}].title to be a string, found a ${titleProp.value.type}`, titleProp.value.position)
    }
    const titleNode = titleProp.value as StringNode

    const listIdProp = findProperty(item, 'listId')
    if (!listIdProp) fail(`card "${titleNode.value}" is missing required property "listId"`, item.position)
    if (listIdProp.value.type !== 'string') {
      fail(`expected cards[${index}].listId to be a string, found a ${listIdProp.value.type}`, listIdProp.value.position)
    }
    const listIdNode = listIdProp.value as StringNode

    const positionProp = findProperty(item, 'position')
    if (!positionProp) fail(`card "${titleNode.value}" is missing required property "position"`, item.position)
    if (positionProp.value.type !== 'number') {
      fail(`expected cards[${index}].position to be a number, found a ${positionProp.value.type}`, positionProp.value.position)
    }

    if (!listIdPositions.has(listIdNode.value)) {
      const known = lists.map((l) => l.id).join(', ') || '(none defined)'
      fail(
        `card "${titleNode.value}" references list "${listIdNode.value}", which is not defined in "lists" (known list ids: ${known})`,
        listIdNode.position
      )
    }

    cards.push({
      id: (idProp.value as StringNode).value,
      title: titleNode.value,
      listId: listIdNode.value,
      position: (positionProp.value as NumberNode).value,
    })
  })

  return { lists, cards }
}
