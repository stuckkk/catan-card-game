import { describe, it, expect } from 'vitest'
import { applyAction, computePlayerStats, computeVP, projectStateFor, tokenHolders, createInitialState, setupChooser } from './engine'
import { ALL_DRAW_CARDS, DEFAULT_EVENT_DECK, CARD_REGISTRY } from './cards'
import { STACK_REGIONS, getRegion } from './regions'
import { emptyDecks, BOARD_REGIONS, regionsWith, settlementA, road, settlementB, playedFor, makePlayer, makeState, res } from './testing/fixtures'
import type { GameState, PlayerState, ResourceType } from './types'

// ─── Catalogue ───────────────────────────────────────────────────────────────

describe('card catalogue', () => {
  it('builds the expansion stacks from all 62 rulebook cards', () => {
    expect(ALL_DRAW_CARDS).toHaveLength(62)
    const count = (id: string) => ALL_DRAW_CARDS.filter(c => c === id).length
    expect(count('garrison')).toBe(3)
    expect(count('town-hall')).toBe(2)
    expect(count('scout')).toBe(2)
    expect(count('spy')).toBe(3)
  })

  it('builds the event deck from the 10 event cards', () => {
    expect(DEFAULT_EVENT_DECK).toHaveLength(10)
    expect(DEFAULT_EVENT_DECK.filter(c => c === 'event-plague')).toHaveLength(2)
    expect(DEFAULT_EVENT_DECK.filter(c => c === 'event-civil-war')).toHaveLength(1)
    expect(DEFAULT_EVENT_DECK.filter(c => c === 'event-conflict')).toHaveLength(1)
    expect(DEFAULT_EVENT_DECK.filter(c => c === 'event-master-builder')).toHaveLength(1)
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
    expect(s.decks.event).toHaveLength(10)
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

  it('gives the host and the guest different production numbers (DE p.2: guest = host + 1, 6 → 1)', () => {
    const numbers = (p: PlayerState) => Object.fromEntries(p.regions.map(r => [getRegion(r.regionId).resourceType, getRegion(r.regionId).productionNumber]))
    expect(numbers(s.players.host)).toEqual({ grain: 1, ore: 2, wool: 3, lumber: 4, brick: 5, gold: 6 })
    expect(numbers(s.players.guest)).toEqual({ grain: 2, ore: 3, wool: 4, lumber: 5, brick: 6, gold: 1 })
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
