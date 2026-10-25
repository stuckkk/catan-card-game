import { describe, it, expect } from 'vitest'
import { applyAction, applyRoll, computePlayerStats, computeVP, getTradeRate } from './engine'
import { emptyDecks, BOARD_ORDER, regionsWith, settlementA, road, settlementB, playedFor, makePlayer, makeState, unlocked, res, roll } from './testing/fixtures'
import type { GameAction, PlayerState, Resources, ResourceType, RegionState } from './types'

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

  it('logs the Knight Token changing hands, and losing it to a tie', () => {
    const s = makeState({ players: { host: makePlayer('host', { hand: ['knight-conrad'], regions: regionsWith({ grain: 1, ore: 1 }) }), guest: makePlayer('guest') } })
    const built = applyAction(s, 'host', { type: 'PLACE_EXPANSION', cardId: 'knight-conrad', slotIndex: 0, expansionSlotIndex: 0 })
    expect(built.eventLog.slice(-1)[0]).toMatchObject({ player: 'host', type: 'token', payload: { token: 'knight', gained: true } })
    const demolished = applyAction(built, 'host', { type: 'DEMOLISH', slotIndex: 0, expansionSlotIndex: 0 })
    expect(demolished.eventLog.slice(-1)[0]).toMatchObject({ player: 'host', type: 'token', payload: { token: 'knight', gained: false } })
    expect(applyAction(demolished, 'host', { type: 'END_ACTION_PHASE' }).eventLog.filter(e => e.type === 'token')).toHaveLength(2)
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

describe('Region choice', () => {
  // Board indices: 0 lumber, 1 wool, 2 brick, 3 ore, 4 grain, 5 gold; index 6 is a 2nd Region of one type.
  const SECOND: Record<ResourceType, string> = {
    lumber: 'forest-2', wool: 'pasture-1', brick: 'hills-3', ore: 'mountains-4', grain: 'fields-3', gold: 'goldfield-2',
  }
  /** The starting board with `a` on its Region of `type` and a 2nd one (index 6) holding `b`. */
  function twoOf(type: ResourceType, a: number, b: number, over: Partial<Resources> = {}): RegionState[] {
    const regions = regionsWith(over)
    regions[BOARD_ORDER.indexOf(type)].storedResources = a
    return [...regions, { regionId: SECOND[type], storedResources: b }]
  }
  const stored = (p: PlayerState) => p.regions.map(r => r.storedResources)
  const pick = (regionIndices: number[]) => ({ type: 'CHOOSE_REGIONS', regionIndices }) satisfies GameAction
  const players = (host: Partial<PlayerState>, guest: Partial<PlayerState> = {}) =>
    ({ host: makePlayer('host', host), guest: makePlayer('guest', guest) })
  const bankLumber = { type: 'TRADE_WITH_BANK', give: 'ore', receive: 'lumber' } satisfies GameAction

  it('asks where a bank trade’s gain goes when 2 Regions have room, and puts it there', () => {
    const s = applyAction(makeState({ players: players({ regions: twoOf('lumber', 1, 1, { ore: 3 }) }) }), 'host', bankLumber)
    expect(s.pendingChoices).toEqual([{ kind: 'region', player: 'host', before: [1, 0, 0, 3, 0, 0, 1], changes: { lumber: 1 } }])
    expect(stored(s.players.host)).toEqual([2, 0, 0, 0, 0, 0, 1])  // placed automatically until the pick
    expect(applyAction(s, 'host', { type: 'END_ACTION_PHASE' })).toBe(s)
    expect(applyAction(s, 'guest', pick([6]))).toBe(s)
    const done = applyAction(s, 'host', pick([6]))
    expect(stored(done.players.host)).toEqual([1, 0, 0, 0, 0, 0, 2])
    expect(done.pendingChoices).toEqual([])
    expect(done.phase).toBe('action')
  })

  it('rejects a pick with the wrong count, a wrong type, an index out of range or over the cap', () => {
    const s = applyAction(makeState({ players: players({ regions: twoOf('lumber', 1, 1, { ore: 3 }) }) }), 'host', bankLumber)
    for (const bad of [[], [0, 6], [1], [3], [7], [-1], [0.5]]) expect(applyAction(s, 'host', pick(bad))).toBe(s)
    // Caravan: 2 Lumber into Forests [2, 1]; 2 more on the first would make 4.
    const base = unlocked()
    const host = { ...base.players.host, hand: ['caravan'], regions: twoOf('lumber', 2, 1, { ore: 2 }) }
    const c = applyAction({ ...base, players: { ...base.players, host } }, 'host',
      { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['ore', 'ore'], receive: ['lumber', 'lumber'] } })
    expect(c.pendingChoices).toEqual([{ kind: 'region', player: 'host', before: [2, 0, 0, 2, 0, 0, 1], changes: { lumber: 2 } }])
    expect(applyAction(c, 'host', pick([0, 0]))).toBe(c)
    expect(stored(applyAction(c, 'host', pick([6, 6])).players.host)).toEqual([2, 0, 0, 0, 0, 0, 3])
  })

  it('does not ask when only 1 Region has room or the gain fills every Region', () => {
    const one = applyAction(makeState({ players: players({ regions: twoOf('lumber', 3, 2, { ore: 3 }) }) }), 'host', bankLumber)
    expect(one.pendingChoices).toEqual([])
    expect(stored(one.players.host)[6]).toBe(3)
    const base = unlocked()
    const host = { ...base.players.host, hand: ['caravan'], regions: twoOf('lumber', 2, 2, { ore: 2 }) }
    const full = applyAction({ ...base, players: { ...base.players, host } }, 'host',
      { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['ore', 'ore'], receive: ['lumber', 'lumber'] } })
    expect(full.pendingChoices).toEqual([])
    expect(stored(full.players.host)).toEqual([3, 0, 0, 0, 0, 0, 3])
  })

  it('asks which Hills pay for a Road when there is a choice, not when all of it goes', () => {
    const road = { type: 'BUILD_ROAD', side: 'right' } satisfies GameAction
    const s = applyAction(makeState({ players: players({ regions: twoOf('brick', 2, 1, { lumber: 1 }) }) }), 'host', road)
    expect(s.pendingChoices).toEqual([{ kind: 'region', player: 'host', before: [1, 0, 2, 0, 0, 0, 1], changes: { brick: -2 } }])
    expect(applyAction(s, 'host', pick([6, 6]))).toBe(s)  // only 1 there
    expect(stored(applyAction(s, 'host', pick([2, 6])).players.host)).toEqual([0, 0, 1, 0, 0, 0, 0])
    const all = applyAction(makeState({ players: players({ regions: twoOf('brick', 1, 1, { lumber: 1 }) }) }), 'host', road)
    expect(all.pendingChoices).toEqual([])
  })

  it('does not offer a new Settlement’s Regions for its own payment', () => {
    const principality = [settlementA(), road(), settlementB(), road(), { kind: 'empty-settlement' as const, cardId: null, regionIndices: [], expansionSlots: [] }]
    const host = { principality, playedCards: playedFor(principality), regions: regionsWith({ lumber: 2, brick: 1, wool: 1, grain: 1 }) }
    const s = applyAction(makeState({ players: players(host), regionStack: ['forest-2', 'hills-3'] }), 'host', { type: 'BUILD_SETTLEMENT', slotIndex: 4 })
    expect(s.players.host.principality[4].kind).toBe('settlement')
    expect(s.pendingChoices).toEqual([])
  })

  it('lets the Windmill holder place the stolen resource and the victim pick where it came from, then produces', () => {
    const city = [settlementA([null, null, null, null]), road(), settlementB()]
    const host = { principality: city, playedCards: playedFor(city, ['marketplace']), regions: twoOf('ore', 0, 0) }
    let s = applyRoll(makeState({ phase: 'roll', players: players(host, { regions: twoOf('ore', 1, 1) }) }), roll('commerce', 6))
    s = applyAction(s, 'host', { type: 'CHOOSE_RESOURCE', resource: 'ore' })
    expect(s.pendingChoices.map(c => [c.kind, c.player])).toEqual([['region', 'host'], ['region', 'guest']])
    expect(s.pendingChoices[1]).toMatchObject({ changes: { ore: -1 } })
    expect(s.phase).toBe('event-resolution')
    s = applyAction(s, 'host', pick([6]))
    s = applyAction(s, 'guest', pick([6]))
    expect(stored(s.players.host)).toEqual([0, 0, 0, 0, 0, 1, 1])   // + gold produced
    expect(stored(s.players.guest)).toEqual([0, 0, 0, 1, 0, 1, 0])
    expect(s.phase).toBe('action')
  })

  it('asks both players after an accepted trade, and holds the accept while a pick is open', () => {
    const state = makeState({ players: players({ regions: twoOf('ore', 1, 1, { lumber: 3 }) }, { regions: twoOf('ore', 0, 0, { wool: 1 }) }) })
    let s = applyAction(state, 'host', { type: 'PROPOSE_TRADE', give: { ore: 1 }, receive: { wool: 1 } })
    const picking = applyAction(s, 'host', { type: 'TRADE_WITH_BANK', give: 'lumber', receive: 'ore' })
    expect(picking.pendingChoices[0]).toMatchObject({ kind: 'region', player: 'host', changes: { ore: 1 } })
    expect(applyAction(picking, 'guest', { type: 'ACCEPT_TRADE' })).toBe(picking)

    s = applyAction(s, 'guest', { type: 'ACCEPT_TRADE' })
    expect(s.pendingChoices).toEqual([
      { kind: 'region', player: 'guest', before: [0, 1, 0, 0, 0, 0, 0], changes: { ore: 1 } },
      { kind: 'region', player: 'host', before: [3, 0, 0, 1, 0, 0, 1], changes: { ore: -1 } },
    ])
    s = applyAction(s, 'guest', pick([6]))
    s = applyAction(s, 'host', pick([6]))
    expect(stored(s.players.guest)).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(stored(s.players.host)).toEqual([3, 1, 0, 1, 0, 0, 0])
  })

  it('uses the net change for a Merchant', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['merchant'], regions: twoOf('ore', 0, 0) }
    const guest = { ...base.players.guest, regions: twoOf('ore', 2, 1) }
    const s = applyAction({ ...base, players: { host, guest } }, 'host',
      { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore', 'ore'], give: ['ore'] } })
    expect(s.pendingChoices).toEqual([
      { kind: 'region', player: 'host', before: [0, 0, 0, 0, 0, 0, 0], changes: { ore: 1 } },
      { kind: 'region', player: 'guest', before: [0, 0, 0, 2, 0, 0, 1], changes: { ore: -1 } },
    ])
  })

  it('asks before a paid Search can be taken from', () => {
    const host = { hand: ['harbor'], regions: twoOf('lumber', 2, 1) }
    let s = applyAction(makeState({ players: players(host), decks: { ...emptyDecks(), 'stack-1': ['mint'] } }), 'host', { type: 'END_ACTION_PHASE' })
    s = applyAction(s, 'host', { type: 'SEARCH_STACK', deck: 'stack-1', payWith: ['lumber', 'lumber'] })
    expect(s.pendingChoices[0]).toMatchObject({ kind: 'region', changes: { lumber: -2 } })
    expect(applyAction(s, 'host', { type: 'TAKE_FROM_SEARCH', cardIds: ['mint'] })).toBe(s)
    s = applyAction(s, 'host', pick([0, 6]))
    s = applyAction(s, 'host', { type: 'TAKE_FROM_SEARCH', cardIds: ['mint'] })
    expect(s.players.host.hand).toContain('mint')
  })
})
