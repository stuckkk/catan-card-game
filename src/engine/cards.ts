import type {
  CardDefinition, DeclarativeEffect, ExpansionColor, ExpansionKind, GameState, PlayerId,
  Resources, ResourceType, DrawStackId, ProductionNumber,
} from './types'
import {
  ALL_RESOURCE_TYPES, availableResources, canAfford, countResources, roomFor,
  spendFromRegions, addToRegions, shuffle, regionsBorderingCards, cityRegionIndices,
} from './board'

export { REGION_DEFINITIONS, getRegion } from './regions'

// Card catalogue from the official rulebook's almanac (GAME_LOGIC.md §10).
// Costs were read from the card icons and confirmed against the physical cards.

const opponentOf = (p: PlayerId): PlayerId => (p === 'host' ? 'guest' : 'host')

/** i18n key stem from a kebab-case id: 'bath-house' → 'cards.bathHouse'. */
function keyOf(id: string): string {
  return 'cards.' + id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

function card(id: string, def: Omit<CardDefinition, 'id' | 'nameKey' | 'descriptionKey'>): CardDefinition {
  return { id, nameKey: `${keyOf(id)}.name`, descriptionKey: `${keyOf(id)}.description`, ...def }
}

function expansion(
  id: string, color: ExpansionColor, kind: ExpansionKind, cost: Partial<Resources>,
  effects: DeclarativeEffect[] = [], directVP?: number,
): CardDefinition {
  return card(id, { category: 'expansion', expansionColor: color, expansionKind: kind, cost, effects, directVP })
}

const commerce = (amount: number): DeclarativeEffect => ({ type: 'GRANT_SYMBOL', symbol: 'commerce', amount })

// ─── Central Axis Cards ───────────────────────────────────────────────────────

export const ROAD = card('road', { category: 'road', cost: { lumber: 1, brick: 2 }, effects: [] })
export const SETTLEMENT = card('settlement', {
  category: 'settlement', cost: { lumber: 1, brick: 1, grain: 1, wool: 1 }, effects: [], directVP: 1,
})
export const CITY = card('city', { category: 'city', cost: { grain: 2, ore: 3 }, effects: [], directVP: 2 })

// ─── Region Expansions (green: Settlement or City) ────────────────────────────

export const ABBEY = expansion('abbey', 'green', 'building', { lumber: 1, ore: 1, brick: 1 },
  [{ type: 'INCREASE_HAND_LIMIT', amount: 1 }])
export const GARRISON = expansion('garrison', 'green', 'building', { lumber: 1, brick: 1 },
  [{ type: 'BRIGAND_PROTECTION' }, commerce(1)])
export const SMITHY = expansion('smithy', 'green', 'building', { ore: 2, lumber: 1 },
  [{ type: 'STRENGTH_PER_KNIGHT', amount: 1 }])

const doubles = (resource: ResourceType): DeclarativeEffect[] => [{ type: 'DOUBLE_PRODUCTION', resource }]
export const BRICK_FACTORY = expansion('brick-factory', 'green', 'building', { brick: 1, ore: 1 }, doubles('brick'))
export const FOUNDRY = expansion('foundry', 'green', 'building', { brick: 1, ore: 1 }, doubles('ore'))
export const GRAIN_MILL = expansion('grain-mill', 'green', 'building', { grain: 1, brick: 1 }, doubles('grain'))
export const SAWMILL = expansion('sawmill', 'green', 'building', { lumber: 2 }, doubles('lumber'))
export const WOOLEN_MILL = expansion('woolen-mill', 'green', 'building', { brick: 1, wool: 1 }, doubles('wool'))

const fleet = (resource: ResourceType) => expansion(`fleet-${resource}`, 'green', 'fleet', { wool: 1, lumber: 1 },
  [{ type: 'IMPROVED_TRADE', resource, rate: 2 }, commerce(1)])
export const FLEETS: CardDefinition[] = (['brick', 'gold', 'grain', 'lumber', 'ore', 'wool'] as ResourceType[]).map(fleet)

const knight = (id: string, cost: Partial<Resources>, strength: number, tournament: number) =>
  expansion(`knight-${id}`, 'green', 'knight', cost, [
    { type: 'GRANT_SYMBOL', symbol: 'strength', amount: strength },
    { type: 'GRANT_SYMBOL', symbol: 'tournament', amount: tournament },
  ])
export const KNIGHTS: CardDefinition[] = [
  knight('conrad', { grain: 1, ore: 1 }, 2, 1),
  knight('falk', { grain: 2, ore: 2, wool: 1 }, 1, 5),
  knight('gotz', { grain: 2, ore: 2, wool: 2 }, 5, 2),
  knight('hagen', { grain: 1, ore: 1 }, 1, 2),
  knight('karl', { grain: 2, ore: 2, wool: 3 }, 7, 1),
  knight('otto', { grain: 1, ore: 2, wool: 1 }, 3, 2),
  knight('pippin', { grain: 1, ore: 1, wool: 1 }, 1, 3),
  knight('siegfried', { ore: 1 }, 1, 1),
  knight('walter', { grain: 1, ore: 1, wool: 1 }, 3, 1),
]

// ─── City Expansions (red: City only) ─────────────────────────────────────────

export const AQUEDUCT = expansion('aqueduct', 'red', 'building', { lumber: 2, ore: 2, brick: 2 },
  [{ type: 'PLAGUE_PROTECTION', scope: 'principality' }], 1)
export const BATH_HOUSE = expansion('bath-house', 'red', 'building', { brick: 2, ore: 1, wool: 1 },
  [{ type: 'PLAGUE_PROTECTION', scope: 'city' }], 1)
/** Civil War protection is not implemented yet (Civil War is out of the deck). */
export const CHURCH = expansion('church', 'red', 'building', { ore: 2, grain: 2, brick: 1 }, [], 1)
export const COLOSSUS = expansion('colossus', 'red', 'building', { ore: 3, brick: 3, grain: 3 }, [], 2)
export const COUNTING_HOUSE = expansion('counting-house', 'red', 'building', { wool: 2, grain: 1, brick: 1 }, [commerce(3)])
export const HARBOR = expansion('harbor', 'red', 'building', { ore: 1, wool: 1, brick: 1 },
  [commerce(1), { type: 'COMMERCE_PER_FLEET', amount: 1 }])
export const LIBRARY = expansion('library', 'red', 'building', { lumber: 2, ore: 2, brick: 1 },
  [{ type: 'INCREASE_HAND_LIMIT', amount: 1 }], 1)
export const MARKETPLACE = expansion('marketplace', 'red', 'building', { grain: 1, wool: 1 }, [commerce(2)])
export const MERCHANT_GUILD = expansion('merchant-guild', 'red', 'building', { wool: 3, brick: 2, grain: 1 }, [commerce(4)])
export const MINT = expansion('mint', 'red', 'building', { lumber: 2, ore: 2, brick: 2 },
  [commerce(1), { type: 'IMPROVED_TRADE', resource: 'gold', rate: 1 }])
export const TOWN_HALL = expansion('town-hall', 'red', 'building', { wool: 2, ore: 2, brick: 1 },
  [{ type: 'SEARCH_DISCOUNT' }], 1)

// ─── Action Cards (yellow) ────────────────────────────────────────────────────

const action = (id: string, customEffect?: CardDefinition['customEffect'], notImplemented?: true) =>
  card(id, { category: 'action', effects: [], customEffect, ...(notImplemented ? { notImplemented } : {}) })

/** Play before the roll: fix the Production Die result (the engine reads alchemistNumber). */
export const ALCHEMIST = action('alchemist', (state, _player, params) => {
  const n = params.productionNumber
  if (!n || !Number.isInteger(n) || n < 1 || n > 6) return null
  return { ...state, alchemistNumber: n as ProductionNumber }
})

/** Trade in 1–2 of your resources for the same number of resources of your choice. */
export const CARAVAN = action('caravan', (state, player, params) => {
  const give = params.give ?? []
  const receive = params.receive ?? []
  if (give.length < 1 || give.length > 2 || receive.length !== give.length) return null
  if (![...give, ...receive].every(r => ALL_RESOURCE_TYPES.includes(r))) return null
  const me = state.players[player]
  if (!canAfford(availableResources(me), countResources(give))) return null
  return {
    ...state,
    players: { ...state.players, [player]: addToRegions(spendFromRegions(me, countResources(give)), countResources(receive)) },
  }
})

/** Take 1–2 resources of your choice from the opponent (you need room for them), then give
 *  them 1 resource of your choice (it may be one you just took). */
export const MERCHANT = action('merchant', (state, player, params) => {
  const take = params.take ?? []
  const give = params.give ?? []
  if (take.length < 1 || take.length > 2 || give.length !== 1) return null
  if (![...take, ...give].every(r => ALL_RESOURCE_TYPES.includes(r))) return null
  const opp = opponentOf(player)
  const taken = countResources(take)
  if (!canAfford(availableResources(state.players[opp]), taken)) return null
  if ((Object.entries(taken) as [ResourceType, number][]).some(([r, n]) => roomFor(state.players[player], r) < n)) return null
  const me = addToRegions(state.players[player], taken)
  if (availableResources(me)[give[0]] < 1) return null
  const them = spendFromRegions(state.players[opp], taken)
  return {
    ...state,
    players: {
      ...state.players,
      [player]: spendFromRegions(me, { [give[0]]: 1 }),
      [opp]: addToRegions(them, { [give[0]]: 1 }),
    },
  }
})

/** Played together with BUILD_SETTLEMENT (the engine handles it); never played on its own. */
export const SCOUT = action('scout', () => null)

export const ARSONIST = action('arsonist', undefined, true)
export const BISHOP = action('bishop', undefined, true)
export const BLACK_KNIGHT = action('black-knight', undefined, true)
export const BRIGANDS = action('brigands', undefined, true)
export const HERB_WOMAN = action('herb-woman', undefined, true)
export const SPY = action('spy', undefined, true)

// ─── Event Cards (blue) ───────────────────────────────────────────────────────

const event = (id: string, customEffect?: CardDefinition['customEffect'], notImplemented?: true) =>
  card(`event-${id}`, { category: 'event', effects: [], customEffect, ...(notImplemented ? { notImplemented } : {}) })

const hasEffect = (cardId: string, type: DeclarativeEffect['type']) =>
  getCard(cardId).effects.some(e => e.type === type)

function mapPlayers(state: GameState, fn: (p: GameState['players']['host']) => GameState['players']['host']): GameState {
  return { ...state, players: { host: fn(state.players.host), guest: fn(state.players.guest) } }
}

/** Every Region bordering a City loses 1 (once), unless protected by an Aqueduct (all
 *  Regions) or a Bath House (the 4 Regions of its City). */
export const EVENT_PLAGUE = event('plague', state => mapPlayers(state, p => {
  if (p.playedCards.includes(AQUEDUCT.id)) return p
  const hit = cityRegionIndices(p)
  const safe = cityRegionIndices(p, slot => slot.expansionSlots.includes(BATH_HOUSE.id))
  const regions = p.regions.map((r, i) =>
    hit.has(i) && !safe.has(i) && r.storedResources > 0 ? { ...r, storedResources: r.storedResources - 1 } : r)
  return { ...p, regions }
}))

/** Every Region gains 1 per bordering Garrison (cap 3). */
export const EVENT_PRODUCTIVE_YEAR = event('productive-year', state => mapPlayers(state, p => {
  const counts = regionsBorderingCards(p, id => hasEffect(id, 'BRIGAND_PROTECTION'))
  const regions = p.regions.map((r, i) =>
    ({ ...r, storedResources: Math.min(3, r.storedResources + (counts.get(i) ?? 0)) }))
  return { ...p, regions }
}))

/** Each player picks 1 resource per Abbey and Library they own; the roller picks first. */
export const EVENT_PROGRESS = event('progress', (state, roller) => {
  const order = [roller, opponentOf(roller)]
  const choices = order.flatMap(player => {
    const n = state.players[player].playedCards.filter(id => id === ABBEY.id || id === LIBRARY.id).length
    return Array.from({ length: n }, () => ({ player, reason: 'progress' as const, options: ALL_RESOURCE_TYPES, takeFrom: null }))
  })
  return { ...state, pendingChoices: [...state.pendingChoices, ...choices] }
})

/** Reshuffle the whole event deck (the engine has already put Year End back under it). */
export const EVENT_YEAR_END = event('year-end', state => ({ ...state, decks: { ...state.decks, event: shuffle(state.decks.event) } }))

export const EVENT_CIVIL_WAR = event('civil-war', undefined, true)
export const EVENT_CONFLICT = event('conflict', undefined, true)
export const EVENT_MASTER_BUILDER = event('master-builder', undefined, true)

// ─── Card Registry ────────────────────────────────────────────────────────────

const ALL_CARDS: CardDefinition[] = [
  ROAD, SETTLEMENT, CITY,
  ABBEY, GARRISON, SMITHY, BRICK_FACTORY, FOUNDRY, GRAIN_MILL, SAWMILL, WOOLEN_MILL, ...FLEETS, ...KNIGHTS,
  AQUEDUCT, BATH_HOUSE, CHURCH, COLOSSUS, COUNTING_HOUSE, HARBOR, LIBRARY, MARKETPLACE, MERCHANT_GUILD, MINT, TOWN_HALL,
  ALCHEMIST, ARSONIST, BISHOP, BLACK_KNIGHT, BRIGANDS, CARAVAN, HERB_WOMAN, MERCHANT, SCOUT, SPY,
  EVENT_CIVIL_WAR, EVENT_CONFLICT, EVENT_MASTER_BUILDER, EVENT_PLAGUE, EVENT_PRODUCTIVE_YEAR, EVENT_PROGRESS, EVENT_YEAR_END,
]

export const CARD_REGISTRY: Record<string, CardDefinition> = Object.fromEntries(ALL_CARDS.map(c => [c.id, c]))

export function getCard(id: string): CardDefinition {
  const def = CARD_REGISTRY[id]
  if (!def) throw new Error(`Unknown card id: ${id}`)
  return def
}

// ─── Deck Compositions (rulebook counts) ──────────────────────────────────────

/** [card, copies in the physical game]. */
const EXPANSION_COUNTS: [CardDefinition, number][] = [
  [ABBEY, 2], [GARRISON, 3], [SMITHY, 1],
  [BRICK_FACTORY, 1], [FOUNDRY, 1], [GRAIN_MILL, 1], [SAWMILL, 1], [WOOLEN_MILL, 1],
  ...FLEETS.map(f => [f, 1] as [CardDefinition, number]),
  ...KNIGHTS.map(k => [k, 1] as [CardDefinition, number]),
  [AQUEDUCT, 2], [BATH_HOUSE, 2], [CHURCH, 2], [COLOSSUS, 1], [COUNTING_HOUSE, 1], [HARBOR, 1],
  [LIBRARY, 2], [MARKETPLACE, 1], [MERCHANT_GUILD, 1], [MINT, 1], [TOWN_HALL, 2],
  [ALCHEMIST, 2], [ARSONIST, 2], [BISHOP, 2], [BLACK_KNIGHT, 3], [BRIGANDS, 1], [CARAVAN, 1],
  [HERB_WOMAN, 2], [MERCHANT, 2], [SCOUT, 2], [SPY, 3],
]

const EVENT_COUNTS: [CardDefinition, number][] = [
  [EVENT_CIVIL_WAR, 1], [EVENT_CONFLICT, 1], [EVENT_MASTER_BUILDER, 1],
  [EVENT_PLAGUE, 2], [EVENT_PRODUCTIVE_YEAR, 2], [EVENT_PROGRESS, 2], [EVENT_YEAR_END, 1],
]

/** Expand counts into a deck, leaving out cards that are not implemented yet (GAME_LOGIC.md §13). */
function deckOf(counts: [CardDefinition, number][]): string[] {
  return counts.filter(([c]) => !c.notImplemented).flatMap(([c, n]) => Array<string>(n).fill(c.id))
}

/** Every Expansion Card in play: shuffled together and split into the 5 expansion stacks. */
export const ALL_DRAW_CARDS: string[] = deckOf(EXPANSION_COUNTS)
export const DEFAULT_EVENT_DECK: string[] = deckOf(EVENT_COUNTS)

export const DRAW_STACK_IDS: DrawStackId[] = ['stack-1', 'stack-2', 'stack-3', 'stack-4', 'stack-5']
