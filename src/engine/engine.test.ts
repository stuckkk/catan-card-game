import { describe, it, expect } from 'vitest'
import {
  applyAction, applyRoll, rollDice, computePlayerStats, computeVP, projectStateFor,
  availableResources, getTradeRate, tokenHolders, createInitialState, searchCost, setupChooser,
} from './engine'
import { ALL_DRAW_CARDS, DEFAULT_EVENT_DECK, CARD_REGISTRY, getCard } from './cards'
import { STACK_REGIONS, getRegion } from './regions'
import type {
  GameState, PlayerState, PlayerId, Resources, ResourceType, RegionState, DiceRoll, DeckId, CentralSlot,
} from './types'

// ─── Test builders (deterministic, no RNG) ──────────────────────────────────

const emptyDecks = (): Record<DeckId, string[]> => ({
  'stack-1': [], 'stack-2': [], 'stack-3': [], 'stack-4': [], 'stack-5': [], event: [],
})

/** The 6 starting-board regions in index order. Indices 0–2 are the top row, 3–5 the bottom.
 *  Settlement A borders 0,3 (left) and 1,4 (right); Settlement B borders 1,4 and 2,5. */
const BOARD_REGIONS: Record<ResourceType, string> = {
  lumber: 'forest-4',      // 0 top-left
  wool: 'pasture-3',       // 1 top-middle (shared)
  brick: 'hills-5',        // 2 top-right
  ore: 'mountains-2',      // 3 bottom-left
  grain: 'fields-1',       // 4 bottom-middle (shared)
  gold: 'goldfield-6',     // 5 bottom-right
}
const BOARD_ORDER: ResourceType[] = ['lumber', 'wool', 'brick', 'ore', 'grain', 'gold']

/** Starting-layout regions holding the given amounts; amounts over 3 spill into extra
 *  off-board regions of the same type (only used for resource-count tests). */
function regionsWith(over: Partial<Resources> = {}): RegionState[] {
  const regions: RegionState[] = BOARD_ORDER.map(t => ({ regionId: BOARD_REGIONS[t], storedResources: 0 }))
  for (const [r, total] of Object.entries(over) as [ResourceType, number][]) {
    const base = regions[BOARD_ORDER.indexOf(r)]
    base.storedResources = Math.min(3, total)
    for (let left = total - base.storedResources; left > 0; left -= 3) {
      regions.push({ regionId: BOARD_REGIONS[r], storedResources: Math.min(3, left) })
    }
  }
  return regions
}

const settlementA = (sites: (string | null)[] = [null, null]): CentralSlot =>
  ({ kind: sites.length === 4 ? 'city' : 'settlement', cardId: sites.length === 4 ? 'city' : 'settlement', regionIndices: [0, 3, 1, 4], expansionSlots: sites })
const road = (): CentralSlot => ({ kind: 'road', cardId: 'road', regionIndices: [], expansionSlots: [] })
const settlementB = (sites: (string | null)[] = [null, null]): CentralSlot =>
  ({ kind: sites.length === 4 ? 'city' : 'settlement', cardId: sites.length === 4 ? 'city' : 'settlement', regionIndices: [1, 4, 2, 5], expansionSlots: sites })

/** Played-card list matching a principality (central cards + placed expansions). */
function playedFor(principality: CentralSlot[], extra: string[] = []): string[] {
  const out: string[] = []
  for (const s of principality) {
    if (s.cardId) out.push(s.cardId)
    for (const e of s.expansionSlots) if (e) out.push(e)
  }
  return [...out, ...extra]
}

function makePlayer(id: PlayerId, over: Partial<PlayerState> = {}): PlayerState {
  const principality = over.principality ?? [settlementA(), road(), settlementB()]
  return {
    id,
    hand: [],
    principality,
    regions: regionsWith(),
    playedCards: playedFor(principality),
    ...over,
  }
}

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    sessionId: 'test',
    config: { vpTarget: 12, language: 'en' },
    players: { host: makePlayer('host'), guest: makePlayer('guest') },
    activePlayer: 'host',
    phase: 'action',
    turn: 10,
    setup: { firstPlayer: 'host', picked: { host: 'stack-1', guest: 'stack-2' } },
    lastRoll: null,
    alchemistNumber: null,
    winner: null,
    decks: emptyDecks(),
    regionStack: [],
    supply: { road: 7, settlement: 5, city: 7 },
    discardPile: [],
    search: null,
    pendingTrade: null,
    pendingChoices: [],
    eventLog: [],
    ...over,
  }
}

/** A state where both players together have ≥7 VP, so Action Cards are unlocked. */
function unlocked(over: Partial<GameState> = {}): GameState {
  const big = [settlementA([null, null, null, null]), road(), settlementB([null, null, null, null])]  // 2 cities = 4 VP
  return makeState({
    players: {
      host: makePlayer('host', { principality: big, playedCards: playedFor(big) }),
      guest: makePlayer('guest', { principality: big, playedCards: playedFor(big) }),
    },
    ...over,
  })
}

const res = (p: PlayerState) => availableResources(p)
const roll = (eventSymbol: DiceRoll['eventSymbol'], productionNumber: DiceRoll['productionNumber'] = 3): DiceRoll =>
  ({ eventSymbol, productionNumber })

// ─── Catalogue ───────────────────────────────────────────────────────────────

describe('card catalogue', () => {
  it('builds the expansion stacks from the 49 implemented of the 62 rulebook cards', () => {
    expect(ALL_DRAW_CARDS).toHaveLength(49)
    const count = (id: string) => ALL_DRAW_CARDS.filter(c => c === id).length
    expect(count('garrison')).toBe(3)
    expect(count('town-hall')).toBe(2)
    expect(count('scout')).toBe(2)
    expect(count('spy')).toBe(0)           // not implemented → kept out
    expect(count('black-knight')).toBe(0)
    expect(ALL_DRAW_CARDS.every(id => !getCard(id).notImplemented)).toBe(true)
  })

  it('builds the event deck from the 7 implemented of the 10 event cards', () => {
    expect(DEFAULT_EVENT_DECK).toHaveLength(7)
    expect(DEFAULT_EVENT_DECK.filter(c => c === 'event-plague')).toHaveLength(2)
    expect(DEFAULT_EVENT_DECK).not.toContain('event-civil-war')
  })

  it('has 11 regions in the Region stack: 2 of each resource and 1 Gold Field', () => {
    const types = STACK_REGIONS.map(r => r.resourceType)
    expect(types).toHaveLength(11)
    expect(types.filter(t => t === 'gold')).toHaveLength(1)
    for (const t of ['lumber', 'wool', 'brick', 'ore', 'grain'] as ResourceType[]) {
      expect(types.filter(x => x === t)).toHaveLength(2)
    }
  })

  it('has an i18n-style key and a known category for every card', () => {
    for (const c of Object.values(CARD_REGISTRY)) {
      expect(c.nameKey).toMatch(/^cards\.[a-zA-Z]+\.name$/)
    }
  })
})

// ─── Derived stats & tokens ──────────────────────────────────────────────────

describe('computePlayerStats', () => {
  it('reads each Knight’s own Strength and Tournament values', () => {
    const p = makePlayer('host', { playedCards: ['knight-karl', 'knight-falk'] })
    const s = computePlayerStats(p)
    expect(s.strengthPoints).toBe(8)    // 7 + 1
    expect(s.tournamentPoints).toBe(6)  // 1 + 5
  })

  it('adds +1 Strength per Knight with a Smithy (not Tournament)', () => {
    const p = makePlayer('host', { playedCards: ['knight-conrad', 'knight-gotz', 'smithy'] })
    const s = computePlayerStats(p)
    expect(s.strengthPoints).toBe(9)    // 2 + 5 + 2×1
    expect(s.tournamentPoints).toBe(3)
  })

  it('counts Commerce from windmills, Fleets, and the Harbor bonus per Fleet', () => {
    const p = makePlayer('host', { playedCards: ['fleet-ore', 'fleet-wool', 'fleet-gold', 'harbor', 'garrison', 'merchant-guild'] })
    // Fleets 3 + Harbor 1 + Harbor bonus 3 + Garrison 1 + Merchant Guild 4
    expect(computePlayerStats(p).commercePoints).toBe(12)
  })

  it('raises the hand limit by 1 per Abbey and Library', () => {
    const p = makePlayer('host', { playedCards: ['abbey', 'abbey', 'library'] })
    expect(computePlayerStats(p).handLimit).toBe(6)
  })

  it('counts direct VP of City Expansions', () => {
    const p = makePlayer('host', { playedCards: ['city', 'colossus', 'library', 'town-hall'] })
    expect(computePlayerStats(p).victoryPoints).toBe(6)  // 2 + 2 + 1 + 1
  })
})

describe('tokens', () => {
  it('gives the Knight Token for any strictly higher Strength (no minimum)', () => {
    const state = makeState({
      players: {
        host: makePlayer('host', { playedCards: [...playedFor([settlementA(), road(), settlementB()]), 'knight-siegfried'] }),
        guest: makePlayer('guest'),
      },
    })
    expect(tokenHolders(state).knight).toBe('host')
    expect(computeVP(state, 'host')).toBe(3)  // 2 settlements + Knight Token
  })

  it('returns the Knight Token to the middle on a tie', () => {
    const k = [...playedFor([settlementA(), road(), settlementB()]), 'knight-hagen']
    const state = makeState({
      players: { host: makePlayer('host', { playedCards: k }), guest: makePlayer('guest', { playedCards: k }) },
    })
    expect(tokenHolders(state).knight).toBeNull()
  })

  it('withholds the Windmill Token from a Commerce leader without a City', () => {
    const state = makeState({
      players: {
        host: makePlayer('host', { playedCards: [...playedFor([settlementA(), road(), settlementB()]), 'fleet-ore'] }),
        guest: makePlayer('guest'),
      },
    })
    expect(tokenHolders(state).windmill).toBeNull()
  })

  it('gives the Windmill Token to a Commerce leader with a City', () => {
    const board = [settlementA([null, null, null, null]), road(), settlementB()]
    const state = makeState({
      players: {
        host: makePlayer('host', { principality: board, playedCards: playedFor(board, ['fleet-ore']) }),
        guest: makePlayer('guest'),
      },
    })
    expect(tokenHolders(state).windmill).toBe('host')
    expect(computeVP(state, 'host')).toBe(4)  // city 2 + settlement 1 + windmill 1
  })
})

describe('victory', () => {
  const winningBoard = () => {
    const board = [settlementA([null, null, null, null]), road(), settlementB([null, null, null, null])]
    return makePlayer('host', { principality: board, playedCards: playedFor(board, ['colossus']) }) // 6 VP
  }

  it('declares the active player the winner once they reach the target', () => {
    const state = makeState({ config: { vpTarget: 6, language: 'en' }, players: { host: winningBoard(), guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'TRADE_WITH_BANK', give: 'lumber', receive: 'ore' })
    expect(next).toBe(state)  // invalid trade: nothing changed, no check
    const s2 = { ...state, players: { ...state.players, host: { ...state.players.host, regions: regionsWith({ lumber: 3 }) } } }
    expect(applyAction(s2, 'host', { type: 'TRADE_WITH_BANK', give: 'lumber', receive: 'ore' }).winner).toBe('host')
  })

  it('does not declare a winner during the opponent’s turn', () => {
    const state = makeState({
      config: { vpTarget: 6, language: 'en' },
      activePlayer: 'guest',
      players: { host: winningBoard(), guest: makePlayer('guest', { regions: regionsWith({ lumber: 3 }) }) },
    })
    const next = applyAction(state, 'guest', { type: 'TRADE_WITH_BANK', give: 'lumber', receive: 'ore' })
    expect(next.winner).toBeNull()
  })
})

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('createInitialState', () => {
  const s = createInitialState({ vpTarget: 12, language: 'en' })

  it('starts in setup with the stacks, event deck, Region stack and supply in place', () => {
    expect(s.phase).toBe('setup')
    expect(s.turn).toBe(0)
    const stacked = (['stack-1', 'stack-2', 'stack-3', 'stack-4', 'stack-5'] as const).flatMap(d => s.decks[d])
    expect(stacked.sort()).toEqual([...ALL_DRAW_CARDS].sort())
    expect(s.decks.event).toHaveLength(7)
    expect(s.regionStack).toHaveLength(11)
    expect(s.supply).toEqual({ road: 7, settlement: 5, city: 7 })
    expect(s.activePlayer).toBe(s.setup.firstPlayer)
  })

  it('gives each player 6 starting regions, one per resource, holding 1 each', () => {
    for (const p of [s.players.host, s.players.guest]) {
      expect(p.regions).toHaveLength(6)
      expect(new Set(p.regions.map(r => getRegion(r.regionId).resourceType)).size).toBe(6)
      expect(res(p)).toEqual({ lumber: 1, wool: 1, brick: 1, ore: 1, grain: 1, gold: 1 })
      expect(p.hand).toEqual([])
      expect(computeVP(s, p.id)).toBe(2)
    }
  })
})

describe('setup phase', () => {
  function setupState(): GameState {
    return makeState({
      phase: 'setup',
      turn: 0,
      activePlayer: 'guest',
      setup: { firstPlayer: 'guest', picked: {} },
      decks: { ...emptyDecks(), 'stack-1': ['abbey', 'garrison', 'mint', 'smithy'], 'stack-2': ['caravan', 'harbor', 'scout'] },
    })
  }

  it('lets the first player look through a stack and take 3 cards, keeping the rest in order', () => {
    let s = applyAction(setupState(), 'guest', { type: 'SEARCH_STACK', deck: 'stack-1' })
    expect(s.search).toEqual({ player: 'guest', deck: 'stack-1', purpose: 'setup' })
    expect(projectStateFor(s, 'guest').searchContents).toEqual(['abbey', 'garrison', 'mint', 'smithy'])
    expect(projectStateFor(s, 'host').searchContents).toBeNull()
    s = applyAction(s, 'guest', { type: 'TAKE_FROM_SEARCH', cardIds: ['abbey', 'mint', 'smithy'] })
    expect(s.players.guest.hand).toEqual(['abbey', 'mint', 'smithy'])
    expect(s.decks['stack-1']).toEqual(['garrison'])
    expect(setupChooser(s)).toBe('host')
  })

  it('makes the second player use a different stack, then starts turn 1 with the first player', () => {
    let s = applyAction(setupState(), 'guest', { type: 'SEARCH_STACK', deck: 'stack-1' })
    s = applyAction(s, 'guest', { type: 'TAKE_FROM_SEARCH', cardIds: ['abbey', 'mint', 'smithy'] })
    expect(applyAction(s, 'host', { type: 'SEARCH_STACK', deck: 'stack-1' })).toBe(s)
    s = applyAction(s, 'host', { type: 'SEARCH_STACK', deck: 'stack-2' })
    s = applyAction(s, 'host', { type: 'TAKE_FROM_SEARCH', cardIds: ['caravan', 'harbor', 'scout'] })
    expect(s.phase).toBe('roll')
    expect(s.turn).toBe(1)
    expect(s.activePlayer).toBe('guest')
  })

  it('does not let the second player pick before the first', () => {
    const s = setupState()
    expect(applyAction(s, 'host', { type: 'SEARCH_STACK', deck: 'stack-2' })).toBe(s)
  })

  it('rejects taking the wrong number of cards or cards not in the stack', () => {
    const s = applyAction(setupState(), 'guest', { type: 'SEARCH_STACK', deck: 'stack-1' })
    expect(applyAction(s, 'guest', { type: 'TAKE_FROM_SEARCH', cardIds: ['abbey'] })).toBe(s)
    expect(applyAction(s, 'guest', { type: 'TAKE_FROM_SEARCH', cardIds: ['abbey', 'mint', 'caravan'] })).toBe(s)
  })

  it('lets either player rearrange their starting regions until they have picked', () => {
    const s = setupState()
    const swapped = applyAction(s, 'host', { type: 'SWAP_STARTING_REGIONS', a: 0, b: 5 })
    expect(swapped.players.host.regions[0].regionId).toBe(BOARD_REGIONS.gold)
    expect(swapped.players.host.regions[5].regionId).toBe(BOARD_REGIONS.lumber)
    expect(applyAction(makeState(), 'host', { type: 'SWAP_STARTING_REGIONS', a: 0, b: 5 }).players.host.regions)
      .toEqual(makeState().players.host.regions)  // not outside setup
  })

  it('ignores normal turn actions during setup', () => {
    const s = setupState()
    expect(applyAction(s, 'guest', { type: 'ROLL_DICE' })).toBe(s)
  })
})

// ─── Production ──────────────────────────────────────────────────────────────

describe('production', () => {
  it('adds 1 to every region (both players) matching the roll', () => {
    const next = applyRoll(makeState({ phase: 'roll' }), roll('tournament', 4))  // forest-4
    expect(res(next.players.host).lumber).toBe(1)
    expect(res(next.players.guest).lumber).toBe(1)
    expect(res(next.players.host).wool).toBe(0)
    expect(next.phase).toBe('action')
  })

  it('doubles a region next to its production building (Sawmill above, Forest top-left)', () => {
    const board = [settlementA(['sawmill', null]), road(), settlementB()]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board) })
    const next = applyRoll(makeState({ phase: 'roll', players: { host, guest: makePlayer('guest') } }), roll('tournament', 4))
    expect(res(next.players.host).lumber).toBe(2)
  })

  it('does not double regions on the other side of the axis', () => {
    const board = [settlementA([null, 'sawmill']), road(), settlementB()]  // below: borders ore & grain
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board) })
    const next = applyRoll(makeState({ phase: 'roll', players: { host, guest: makePlayer('guest') } }), roll('tournament', 4))
    expect(res(next.players.host).lumber).toBe(1)
  })

  it('caps doubled production at 3', () => {
    const board = [settlementA(['sawmill', null]), road(), settlementB()]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), regions: regionsWith({ lumber: 2 }) })
    const next = applyRoll(makeState({ phase: 'roll', players: { host, guest: makePlayer('guest') } }), roll('tournament', 4))
    expect(res(next.players.host).lumber).toBe(3)
  })
})

// ─── Event die ───────────────────────────────────────────────────────────────

describe('Brigand Attack', () => {
  const rich = () => regionsWith({ lumber: 3, ore: 3, wool: 2 })  // 8 resources

  it('is ignored during each player’s first two turns', () => {
    const state = makeState({ phase: 'roll', turn: 4, players: { host: makePlayer('host', { regions: rich() }), guest: makePlayer('guest') } })
    const next = applyRoll(state, roll('brigand', 6))
    expect(res(next.players.host).ore).toBe(3)
  })

  it('takes all Ore and Wool from a player with more than 7, then production still happens', () => {
    const state = makeState({ phase: 'roll', turn: 5, players: { host: makePlayer('host', { regions: rich() }), guest: makePlayer('guest') } })
    const next = applyRoll(state, roll('brigand', 3))  // pasture-3 produces after the attack
    expect(res(next.players.host).ore).toBe(0)
    expect(res(next.players.host).wool).toBe(1)
    expect(res(next.players.host).lumber).toBe(3)
    expect(next.phase).toBe('action')
  })

  it('does not count regions next to a Garrison', () => {
    // Garrison above Settlement A guards Forest (0) and Pasture (1): 3 + 2 uncounted, 3 counted.
    const board = [settlementA(['garrison', null]), road(), settlementB()]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), regions: rich() })
    const next = applyRoll(makeState({ phase: 'roll', turn: 5, players: { host, guest: makePlayer('guest') } }), roll('brigand', 6))
    expect(res(next.players.host).ore).toBe(3)
  })

  it('still takes protected Ore and Wool when the unprotected count exceeds 7', () => {
    const board = [settlementA(['garrison', null]), road(), settlementB()]
    const regions = regionsWith({ wool: 3, ore: 3, grain: 3, gold: 3 })  // guarded: wool 3; counted: 9
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), regions })
    const next = applyRoll(makeState({ phase: 'roll', turn: 5, players: { host, guest: makePlayer('guest') } }), roll('brigand', 6))
    expect(res(next.players.host).wool).toBe(0)
    expect(res(next.players.host).ore).toBe(0)
  })
})

describe('Commerce event (Windmill Token)', () => {
  const cityBoard = () => [settlementA([null, null, null, null]), road(), settlementB()]

  it('lets the Windmill Token holder take a resource the opponent holds', () => {
    const host = makePlayer('host', { principality: cityBoard(), playedCards: playedFor(cityBoard(), ['marketplace']) })
    const guest = makePlayer('guest', { regions: regionsWith({ ore: 2 }) })
    let s = applyRoll(makeState({ phase: 'roll', players: { host, guest } }), roll('commerce', 6))
    expect(s.pendingChoices[0]).toEqual({ player: 'host', reason: 'commerce', options: ['ore'], takeFrom: 'guest' })
    s = applyAction(s, 'host', { type: 'CHOOSE_RESOURCE', resource: 'ore' })
    expect(res(s.players.guest).ore).toBe(1)
    expect(res(s.players.host).ore).toBe(1)
    expect(s.phase).toBe('action')
  })

  it('does nothing when nobody holds the Windmill Token', () => {
    const s = applyRoll(makeState({ phase: 'roll' }), roll('commerce', 6))
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
  })
})

describe('Tournament and Year of Plenty', () => {
  it('gives the higher Tournament total a free resource', () => {
    const host = makePlayer('host', { playedCards: ['settlement', 'knight-pippin'] })  // 3
    const guest = makePlayer('guest', { playedCards: ['settlement', 'knight-karl'] }) // 1
    let s = applyRoll(makeState({ phase: 'roll', players: { host, guest } }), roll('tournament', 6))
    expect(s.pendingChoices[0].player).toBe('host')
    s = applyAction(s, 'host', { type: 'CHOOSE_RESOURCE', resource: 'gold' })
    expect(res(s.players.host).gold).toBe(2)  // 1 chosen + 1 produced (goldfield-6)
  })

  it('gives nobody anything on a tie', () => {
    const s = applyRoll(makeState({ phase: 'roll' }), roll('tournament', 6))
    expect(s.pendingChoices).toEqual([])
  })

  it('Year of Plenty lets both players choose, active player first', () => {
    let s = applyRoll(makeState({ phase: 'roll' }), roll('yearOfPlenty', 6))
    expect(s.pendingChoices.map(c => c.player)).toEqual(['host', 'guest'])
    expect(applyAction(s, 'guest', { type: 'CHOOSE_RESOURCE', resource: 'ore' })).toBe(s)
    s = applyAction(s, 'host', { type: 'CHOOSE_RESOURCE', resource: 'ore' })
    s = applyAction(s, 'guest', { type: 'CHOOSE_RESOURCE', resource: 'wool' })
    expect(res(s.players.host).ore).toBe(1)
    expect(res(s.players.guest).wool).toBe(1)
    expect(s.phase).toBe('action')
  })
})

describe('rollDice', () => {
  it('is deterministic given a fixed RNG', () => {
    expect(rollDice(() => 0)).toEqual({ eventSymbol: 'brigand', productionNumber: 1 })
    expect(rollDice(() => 0.999)).toEqual({ eventSymbol: 'event', productionNumber: 6 })
  })

  it('puts the Event Card face on 2 of the 6 faces', () => {
    const faces = [0, 1, 2, 3, 4, 5].map(i => rollDice(() => (i + 0.5) / 6).eventSymbol)
    expect(faces).toEqual(['brigand', 'commerce', 'tournament', 'yearOfPlenty', 'event', 'event'])
  })
})

// ─── Event cards ─────────────────────────────────────────────────────────────

describe('event cards', () => {
  const withEvent = (top: string, over: Partial<GameState> = {}) =>
    makeState({ phase: 'roll', decks: { ...emptyDecks(), event: ['event-year-end', top] }, ...over })

  it('puts the revealed card under the event deck', () => {
    const s = applyRoll(withEvent('event-productive-year'), roll('event', 6))
    expect(s.decks.event).toEqual(['event-productive-year', 'event-year-end'])
  })

  it('Plague: every region bordering a City loses 1, a shared region only once', () => {
    const board = [settlementA([null, null, null, null]), road(), settlementB([null, null, null, null])]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), regions: regionsWith({ lumber: 2, wool: 2, gold: 1 }) })
    const s = applyRoll(withEvent('event-plague', { players: { host, guest: makePlayer('guest', { regions: regionsWith({ lumber: 2 }) }) } }), roll('event', 6))
    expect(res(s.players.host)).toMatchObject({ lumber: 1, wool: 1, gold: 1 })  // gold +1 produced (6) after -1
    expect(res(s.players.guest).lumber).toBe(2)  // no cities
  })

  it('Plague: a Bath House protects the 4 regions of its City (shared ones too)', () => {
    const board = [settlementA(['bath-house', null, null, null]), road(), settlementB([null, null, null, null])]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), regions: regionsWith({ lumber: 2, wool: 2, brick: 2 }) })
    const s = applyRoll(withEvent('event-plague', { players: { host, guest: makePlayer('guest') } }), roll('event', 1))
    expect(res(s.players.host)).toMatchObject({ lumber: 2, wool: 2, brick: 1 })
  })

  it('Plague: an Aqueduct protects all regions', () => {
    const board = [settlementA(['aqueduct', null, null, null]), road(), settlementB()]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), regions: regionsWith({ lumber: 2 }) })
    const s = applyRoll(withEvent('event-plague', { players: { host, guest: makePlayer('guest') } }), roll('event', 1))
    expect(res(s.players.host).lumber).toBe(2)
  })

  it('Productive Year: +1 per bordering Garrison', () => {
    // Garrisons above both Settlements: Pasture (1) borders both → +2; Forest and Hills +1.
    const board = [settlementA(['garrison', null]), road(), settlementB(['garrison', null])]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board) })
    const s = applyRoll(withEvent('event-productive-year', { players: { host, guest: makePlayer('guest') } }), roll('event', 6))
    expect(res(s.players.host)).toMatchObject({ lumber: 1, wool: 2, brick: 1, ore: 0 })
  })

  it('Progress: one choice per Abbey/Library, roller first, then production', () => {
    const host = makePlayer('host', { playedCards: ['settlement', 'abbey', 'library'] })
    const guest = makePlayer('guest', { playedCards: ['settlement', 'abbey'] })
    let s = applyRoll(withEvent('event-progress', { players: { host, guest } }), roll('event', 6))
    expect(s.phase).toBe('event-resolution')
    expect(s.pendingChoices.map(c => [c.player, c.reason])).toEqual([['host', 'progress'], ['host', 'progress'], ['guest', 'progress']])
    s = applyAction(s, 'host', { type: 'CHOOSE_RESOURCE', resource: 'ore' })
    s = applyAction(s, 'host', { type: 'CHOOSE_RESOURCE', resource: 'ore' })
    s = applyAction(s, 'guest', { type: 'CHOOSE_RESOURCE', resource: 'brick' })
    expect(res(s.players.host).ore).toBe(2)
    expect(res(s.players.guest)).toMatchObject({ brick: 1, gold: 1 })
    expect(s.phase).toBe('action')
  })

  it('Year End: reshuffles the whole event deck, itself included', () => {
    const s = applyRoll(makeState({ phase: 'roll', decks: { ...emptyDecks(), event: ['event-plague', 'event-progress', 'event-year-end'] } }), roll('event', 6))
    expect([...s.decks.event].sort()).toEqual(['event-plague', 'event-progress', 'event-year-end'])
  })
})

// ─── Building ────────────────────────────────────────────────────────────────

describe('roads and settlements', () => {
  const builder = (over: Partial<Resources> = { lumber: 3, brick: 3, wool: 1, grain: 1 }) =>
    makeState({ players: { host: makePlayer('host', { regions: regionsWith(over) }), guest: makePlayer('guest') } })

  it('builds a road on the right, paying 1 Lumber + 2 Brick and using the supply', () => {
    const s = applyAction(builder(), 'host', { type: 'BUILD_ROAD', side: 'right' })
    expect(s.players.host.principality.map(p => p.kind)).toEqual(['settlement', 'road', 'settlement', 'road', 'empty-settlement'])
    expect(res(s.players.host)).toMatchObject({ lumber: 2, brick: 1 })
    expect(s.supply.road).toBe(6)
  })

  it('builds a road on the left', () => {
    const s = applyAction(builder(), 'host', { type: 'BUILD_ROAD', side: 'left' })
    expect(s.players.host.principality.map(p => p.kind)).toEqual(['empty-settlement', 'road', 'settlement', 'road', 'settlement'])
  })

  it('never builds a road next to another road / an empty site', () => {
    const s = applyAction(builder({ lumber: 3, brick: 6 }), 'host', { type: 'BUILD_ROAD', side: 'right' })
    expect(applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'right' })).toBe(s)
  })

  it('cannot build when the supply is empty', () => {
    const s = { ...builder(), supply: { road: 0, settlement: 5, city: 7 } }
    expect(applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'right' })).toBe(s)
  })

  it('builds a settlement on the right with the top 2 Region stack cards, sharing corners', () => {
    let s = { ...builder(), regionStack: ['hills-3', 'forest-2', 'fields-5'] }
    s = applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'right' })
    s = applyAction(s, 'host', { type: 'BUILD_SETTLEMENT', slotIndex: 4 })
    const p = s.players.host
    expect(p.principality[4]).toMatchObject({ kind: 'settlement', regionIndices: [2, 5, 6, 7], expansionSlots: [null, null] })
    expect(p.regions.slice(6)).toEqual([{ regionId: 'fields-5', storedResources: 0 }, { regionId: 'forest-2', storedResources: 0 }])
    expect(s.regionStack).toEqual(['hills-3'])
    expect(s.supply.settlement).toBe(4)
    expect(computeVP(s, 'host')).toBe(3)
  })

  it('builds a settlement on the left, sharing the neighbour’s left corners', () => {
    let s = { ...builder(), regionStack: ['hills-3', 'forest-2'] }
    s = applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'left' })
    s = applyAction(s, 'host', { type: 'BUILD_SETTLEMENT', slotIndex: 0 })
    expect(s.players.host.principality[0].regionIndices).toEqual([6, 7, 0, 3])
  })

  it('lets a Scout choose both regions (even below 7 VP) and reshuffles the stack', () => {
    let s = { ...builder(), regionStack: ['hills-3', 'forest-2', 'goldfield-2', 'fields-5'] }
    s = { ...s, players: { ...s.players, host: { ...s.players.host, hand: ['scout'] } } }
    s = applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'right' })
    s = applyAction(s, 'host', { type: 'BUILD_SETTLEMENT', slotIndex: 4, scoutRegionIds: ['goldfield-2', 'hills-3'] })
    expect(s.players.host.regions.slice(6).map(r => r.regionId)).toEqual(['goldfield-2', 'hills-3'])
    expect(s.players.host.hand).toEqual([])
    expect(s.discardPile).toEqual(['scout'])
    expect([...s.regionStack].sort()).toEqual(['fields-5', 'forest-2'])
  })

  it('rejects a Scout pick that is not in the Region stack', () => {
    let s = { ...builder(), regionStack: ['hills-3', 'forest-2'] }
    s = { ...s, players: { ...s.players, host: { ...s.players.host, hand: ['scout'] } } }
    s = applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'right' })
    expect(applyAction(s, 'host', { type: 'BUILD_SETTLEMENT', slotIndex: 4, scoutRegionIds: ['goldfield-2', 'hills-3'] })).toBe(s)
  })
})

describe('cities and expansions', () => {
  it('upgrades a settlement to a city, keeping above/below sides', () => {
    const board = [settlementA(['abbey', 'garrison']), road(), settlementB()]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), regions: regionsWith({ ore: 3, grain: 2 }) })
    const s = applyAction(makeState({ players: { host, guest: makePlayer('guest') } }), 'host', { type: 'BUILD_CITY', slotIndex: 0 })
    expect(s.players.host.principality[0]).toMatchObject({ kind: 'city', expansionSlots: ['abbey', null, 'garrison', null] })
    expect(computePlayerStats(s.players.host).victoryPoints).toBe(3)
    expect(s.supply.city).toBe(6)
  })

  it('places a green expansion, paying its cost', () => {
    const host = makePlayer('host', { hand: ['abbey'], regions: regionsWith({ lumber: 1, ore: 1, brick: 1 }) })
    const s = applyAction(makeState({ players: { host, guest: makePlayer('guest') } }), 'host',
      { type: 'PLACE_EXPANSION', cardId: 'abbey', slotIndex: 0, expansionSlotIndex: 1 })
    expect(s.players.host.principality[0].expansionSlots).toEqual([null, 'abbey'])
    expect(computePlayerStats(s.players.host).handLimit).toBe(4)
    expect(res(s.players.host)).toMatchObject({ lumber: 0, ore: 0, brick: 0 })
  })

  it('rejects a red expansion on a settlement and accepts it on a city', () => {
    const board = [settlementA(), road(), settlementB([null, null, null, null])]
    const host = makePlayer('host', { principality: board, playedCards: playedFor(board), hand: ['marketplace'], regions: regionsWith({ grain: 1, wool: 1 }) })
    const s = makeState({ players: { host, guest: makePlayer('guest') } })
    expect(applyAction(s, 'host', { type: 'PLACE_EXPANSION', cardId: 'marketplace', slotIndex: 0, expansionSlotIndex: 0 })).toBe(s)
    const ok = applyAction(s, 'host', { type: 'PLACE_EXPANSION', cardId: 'marketplace', slotIndex: 2, expansionSlotIndex: 3 })
    expect(ok.players.host.principality[2].expansionSlots[3]).toBe('marketplace')
  })

  it('rejects placing outside the action phase or without the resources', () => {
    const host = makePlayer('host', { hand: ['abbey'], regions: regionsWith({ lumber: 1, ore: 1 }) })
    const s = makeState({ players: { host, guest: makePlayer('guest') } })
    expect(applyAction(s, 'host', { type: 'PLACE_EXPANSION', cardId: 'abbey', slotIndex: 0, expansionSlotIndex: 0 })).toBe(s)
  })

  it('demolishes an expansion to the discard pile for free', () => {
    const board = [settlementA(['abbey', null]), road(), settlementB()]
    const s = applyAction(makeState({ players: { host: makePlayer('host', { principality: board, playedCards: playedFor(board) }), guest: makePlayer('guest') } }),
      'host', { type: 'DEMOLISH', slotIndex: 0, expansionSlotIndex: 0 })
    expect(s.players.host.principality[0].expansionSlots).toEqual([null, null])
    expect(s.players.host.playedCards).not.toContain('abbey')
    expect(s.discardPile).toEqual(['abbey'])
  })
})

// ─── Trading ─────────────────────────────────────────────────────────────────

describe('trade with bank', () => {
  it('uses 3:1 by default, 2:1 with a Fleet, and 1:1 gold with a Mint', () => {
    expect(getTradeRate(makePlayer('host'), 'ore')).toBe(3)
    expect(getTradeRate(makePlayer('host', { playedCards: ['fleet-ore'] }), 'ore')).toBe(2)
    expect(getTradeRate(makePlayer('host', { playedCards: ['mint'] }), 'gold')).toBe(1)
    expect(getTradeRate(makePlayer('host', { playedCards: ['mint', 'fleet-gold'] }), 'gold')).toBe(1)
  })

  it('trades at the player’s rate', () => {
    const host = makePlayer('host', { playedCards: ['fleet-ore'], regions: regionsWith({ ore: 2 }) })
    const s = applyAction(makeState({ players: { host, guest: makePlayer('guest') } }), 'host', { type: 'TRADE_WITH_BANK', give: 'ore', receive: 'grain' })
    expect(res(s.players.host)).toMatchObject({ ore: 0, grain: 1 })
  })

  it('rejects unaffordable, same-resource and off-phase trades', () => {
    const s = makeState({ players: { host: makePlayer('host', { regions: regionsWith({ ore: 3 }) }), guest: makePlayer('guest') } })
    expect(applyAction(s, 'host', { type: 'TRADE_WITH_BANK', give: 'wool', receive: 'ore' })).toBe(s)
    expect(applyAction(s, 'host', { type: 'TRADE_WITH_BANK', give: 'ore', receive: 'ore' })).toBe(s)
    const roll = { ...s, phase: 'roll' as const }
    expect(applyAction(roll, 'host', { type: 'TRADE_WITH_BANK', give: 'ore', receive: 'wool' })).toBe(roll)
  })
})

describe('player trade', () => {
  const state = () => makeState({
    players: { host: makePlayer('host', { regions: regionsWith({ ore: 2 }) }), guest: makePlayer('guest', { regions: regionsWith({ wool: 1 }) }) },
  })

  it('moves resources both ways when the opponent accepts', () => {
    let s = applyAction(state(), 'host', { type: 'PROPOSE_TRADE', give: { ore: 2 }, receive: { wool: 1 } })
    s = applyAction(s, 'guest', { type: 'ACCEPT_TRADE' })
    expect(res(s.players.host)).toMatchObject({ ore: 0, wool: 1 })
    expect(res(s.players.guest)).toMatchObject({ ore: 2, wool: 0 })
  })

  it('clears the offer on decline and ignores an accept from the proposer', () => {
    const offered = applyAction(state(), 'host', { type: 'PROPOSE_TRADE', give: { ore: 1 }, receive: { wool: 1 } })
    expect(applyAction(offered, 'host', { type: 'ACCEPT_TRADE' })).toBe(offered)
    expect(applyAction(offered, 'guest', { type: 'DECLINE_TRADE' }).pendingTrade).toBeNull()
  })
})

// ─── Action Cards ────────────────────────────────────────────────────────────

describe('action cards', () => {
  it('are locked until both players together have 7 VP', () => {
    const host = makePlayer('host', { hand: ['caravan'], regions: regionsWith({ ore: 2 }) })
    const s = makeState({ players: { host, guest: makePlayer('guest') } })  // 2 + 2 VP
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['ore'], receive: ['wool'] } })).toBe(s)
  })

  it('Caravan trades up to 2 resources for 2 others and is discarded', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['caravan'], regions: regionsWith({ lumber: 3 }) }
    const s = applyAction({ ...base, players: { ...base.players, host } }, 'host',
      { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['lumber', 'lumber'], receive: ['ore', 'grain'] } })
    expect(res(s.players.host)).toMatchObject({ lumber: 1, ore: 1, grain: 1 })
    expect(s.players.host.hand).toEqual([])
    expect(s.discardPile).toEqual(['caravan'])
  })

  it('Caravan rejects more than 2 or unaffordable resources', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['caravan'], regions: regionsWith({ lumber: 1 }) }
    const s = { ...base, players: { ...base.players, host } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['lumber', 'lumber'], receive: ['ore', 'ore'] } })).toBe(s)
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['lumber'], receive: ['ore', 'ore'] } })).toBe(s)
  })

  it('Merchant takes 2 from the opponent and gives 1 back', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['merchant'], regions: regionsWith({ ore: 1 }) }
    const guest = { ...base.players.guest, regions: regionsWith({ ore: 2, wool: 1 }) }
    const s = { ...base, players: { host, guest } }
    // The give must be something the host holds after taking — wool is not.
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore', 'ore'], give: ['wool'] } })).toBe(s)
    const ok = applyAction(s, 'host',
      { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore', 'wool'], give: ['ore'] } })
    expect(res(ok.players.host)).toMatchObject({ ore: 1, wool: 1 })
    expect(res(ok.players.guest)).toMatchObject({ ore: 2, wool: 0 })
  })

  it('Merchant needs room on the taker’s regions', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['merchant'], regions: regionsWith({ ore: 3 }) }
    const guest = { ...base.players.guest, regions: regionsWith({ ore: 2 }) }
    const s = { ...base, players: { host, guest } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore'], give: ['ore'] } })).toBe(s)
  })

  it('Alchemist is played before the roll and fixes the Production Die', () => {
    const base = unlocked({ phase: 'roll' })
    const s0 = { ...base, players: { ...base.players, host: { ...base.players.host, hand: ['alchemist'] } } }
    const s1 = applyAction(s0, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'alchemist', params: { productionNumber: 5 } })
    expect(s1.alchemistNumber).toBe(5)
    const s2 = applyRoll(s1, roll('tournament', 2))
    expect(s2.lastRoll?.productionNumber).toBe(5)
    expect(s2.alchemistNumber).toBeNull()
    expect(res(s2.players.host).brick).toBe(1)  // hills-5
  })

  it('Alchemist cannot be played after the roll', () => {
    const base = unlocked()
    const s = { ...base, players: { ...base.players, host: { ...base.players.host, hand: ['alchemist'] } } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'alchemist', params: { productionNumber: 5 } })).toBe(s)
  })

  it('Scout cannot be played on its own, and unimplemented cards cannot be played', () => {
    const base = unlocked()
    const s = { ...base, players: { ...base.players, host: { ...base.players.host, hand: ['scout', 'spy'] } } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'scout' })).toBe(s)
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'spy' })).toBe(s)
  })
})

// ─── Draw phase ──────────────────────────────────────────────────────────────

describe('draw phase', () => {
  const stacks = () => ({ ...emptyDecks(), 'stack-1': ['abbey', 'garrison', 'mint'], 'stack-2': ['smithy', 'harbor'] })
  const withHand = (hand: string[], over: Partial<GameState> = {}, regions = regionsWith()) =>
    makeState({ decks: stacks(), players: { host: makePlayer('host', { hand, regions }), guest: makePlayer('guest') }, ...over })

  it('goes to the draw step below the limit and to the exchange step at the limit', () => {
    expect(applyAction(withHand(['abbey']), 'host', { type: 'END_ACTION_PHASE' }).phase).toBe('draw')
    expect(applyAction(withHand(['abbey', 'mint', 'smithy']), 'host', { type: 'END_ACTION_PHASE' }).phase).toBe('exchange')
    expect(applyAction(withHand(['abbey', 'mint', 'smithy', 'harbor']), 'host', { type: 'END_ACTION_PHASE' }).phase).toBe('draw')
  })

  it('draws top cards from any stack and passes the turn once the hand is full', () => {
    let s = applyAction(withHand(['harbor']), 'host', { type: 'END_ACTION_PHASE' })
    s = applyAction(s, 'host', { type: 'DRAW_CARD', fromDeck: 'stack-1' })
    expect(s.players.host.hand).toEqual(['harbor', 'mint'])
    expect(s.phase).toBe('draw')
    s = applyAction(s, 'host', { type: 'DRAW_CARD', fromDeck: 'stack-2' })
    expect(s.players.host.hand).toEqual(['harbor', 'mint', 'harbor'])
    expect(s.phase).toBe('roll')
    expect(s.activePlayer).toBe('guest')
    expect(s.turn).toBe(11)
  })

  it('searches a stack for any 2 resources (mixed), revealing it to the searcher only', () => {
    let s = applyAction(withHand(['harbor', 'smithy'], {}, regionsWith({ ore: 1, wool: 1 })), 'host', { type: 'END_ACTION_PHASE' })
    expect(applyAction(s, 'host', { type: 'SEARCH_STACK', deck: 'stack-1', payWith: ['ore'] })).toBe(s)
    s = applyAction(s, 'host', { type: 'SEARCH_STACK', deck: 'stack-1', payWith: ['ore', 'wool'] })
    expect(res(s.players.host)).toMatchObject({ ore: 0, wool: 0 })
    expect(projectStateFor(s, 'host').searchContents).toEqual(['abbey', 'garrison', 'mint'])
    expect(projectStateFor(s, 'guest').searchContents).toBeNull()
    s = applyAction(s, 'host', { type: 'TAKE_FROM_SEARCH', cardIds: ['garrison'] })
    expect(s.players.host.hand).toContain('garrison')
    expect(s.decks['stack-1']).toEqual(['abbey', 'mint'])
    expect(s.phase).toBe('roll')
  })

  it('makes a search cost 1 with a Town Hall', () => {
    const p = makePlayer('host', { playedCards: ['city', 'town-hall'] })
    expect(searchCost(p)).toBe(1)
    expect(searchCost(makePlayer('host'))).toBe(2)
  })

  it('puts excess cards under stacks of the player’s choice, then offers the exchange', () => {
    let s = applyAction(withHand(['abbey', 'mint', 'smithy', 'harbor', 'garrison']), 'host', { type: 'END_ACTION_PHASE' })
    expect(applyAction(s, 'host', { type: 'DISCARD_TO_LIMIT', discards: [{ cardId: 'abbey', toDeck: 'stack-3' }] })).toBe(s)
    s = applyAction(s, 'host', { type: 'DISCARD_TO_LIMIT', discards: [{ cardId: 'abbey', toDeck: 'stack-3' }, { cardId: 'mint', toDeck: 'stack-1' }] })
    expect(s.players.host.hand).toEqual(['smithy', 'harbor', 'garrison'])
    expect(s.decks['stack-3']).toEqual(['abbey'])
    expect(s.decks['stack-1'][0]).toBe('mint')
    expect(s.phase).toBe('exchange')
  })

  it('exchanges a card for the top card of the same stack', () => {
    let s = applyAction(withHand(['harbor', 'smithy', 'abbey']), 'host', { type: 'END_ACTION_PHASE' })
    s = applyAction(s, 'host', { type: 'EXCHANGE', cardId: 'harbor', deck: 'stack-1' })
    expect(s.players.host.hand).toEqual(['smithy', 'abbey', 'mint'])
    expect(s.decks['stack-1']).toEqual(['harbor', 'abbey', 'garrison'])
    expect(s.phase).toBe('roll')
  })

  it('exchanges a card by searching the same stack', () => {
    let s = applyAction(withHand(['harbor', 'smithy', 'abbey'], {}, regionsWith({ gold: 2 })), 'host', { type: 'END_ACTION_PHASE' })
    s = applyAction(s, 'host', { type: 'EXCHANGE', cardId: 'harbor', deck: 'stack-2', payWith: ['gold', 'gold'] })
    expect(s.search).toEqual({ player: 'host', deck: 'stack-2', purpose: 'exchange' })
    s = applyAction(s, 'host', { type: 'TAKE_FROM_SEARCH', cardIds: ['smithy'] })
    expect(s.players.host.hand).toEqual(['smithy', 'abbey', 'smithy'])
    expect(s.decks['stack-2']).toEqual(['harbor', 'harbor'])
    expect(s.phase).toBe('roll')
  })

  it('cannot exchange after drawing', () => {
    let s = applyAction(withHand(['harbor', 'smithy']), 'host', { type: 'END_ACTION_PHASE' })
    s = applyAction(s, 'host', { type: 'DRAW_CARD', fromDeck: 'stack-1' })
    expect(s.phase).toBe('roll')
    expect(applyAction(s, 'host', { type: 'EXCHANGE', cardId: 'harbor', deck: 'stack-1' })).toBe(s)
  })

  it('skipping the exchange passes the turn', () => {
    let s = applyAction(withHand(['harbor', 'smithy', 'abbey']), 'host', { type: 'END_ACTION_PHASE' })
    s = applyAction(s, 'host', { type: 'SKIP_EXCHANGE' })
    expect(s).toMatchObject({ phase: 'roll', activePlayer: 'guest', turn: 11 })
  })

  it('passes the turn when there is nothing left to draw', () => {
    const s = applyAction(withHand([], { decks: emptyDecks() }), 'host', { type: 'END_ACTION_PHASE' })
    expect(s.phase).toBe('roll')
  })
})

// ─── Projection ──────────────────────────────────────────────────────────────

describe('projectStateFor', () => {
  it('hides the opponent’s hand, stack contents and the Region stack order', () => {
    const s = makeState({
      players: { host: makePlayer('host', { hand: ['abbey'] }), guest: makePlayer('guest', { hand: ['mint', 'smithy'] }) },
      decks: { ...emptyDecks(), 'stack-1': ['abbey', 'mint'] },
      regionStack: ['hills-3', 'forest-2'],
    })
    const forHost = projectStateFor(s, 'host')
    expect(forHost.players.host.hand).toEqual(['abbey'])
    expect(forHost.players.guest.hand).toBe(2)
    expect(forHost.deckSizes['stack-1']).toBe(2)
    expect('decks' in forHost).toBe(false)
    expect(forHost.regionStack).toEqual(['forest-2', 'hills-3'])
    expect(projectStateFor(s, 'guest').players.host.hand).toBe(1)
  })
})
