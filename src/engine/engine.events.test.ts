import { describe, it, expect } from 'vitest'
import { applyAction, applyRoll, rollDice, tokenHolders } from './engine'
import { emptyDecks, regionsWith, settlementA, road, settlementB, playedFor, makePlayer, makeState, res, roll } from './testing/fixtures'
import type { GameState, PlayerState, PlayerId, CentralSlot } from './types'

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
    expect(s.pendingChoices[0]).toEqual({ kind: 'resource', player: 'host', reason: 'commerce', options: ['ore'], takeFrom: 'guest' })
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
    expect(s.pendingChoices.map(c => [c.player, c.kind === 'resource' && c.reason])).toEqual([['host', 'progress'], ['host', 'progress'], ['guest', 'progress']])
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

describe('Civil War', () => {
  /** Host rolls Civil War (production 6: only the Gold Fields produce). */
  const civilWar = (host: PlayerState, guest: PlayerState, over: Partial<GameState> = {}) =>
    applyRoll(makeState({ phase: 'roll', players: { host, guest }, decks: { ...emptyDecks(), event: ['event-civil-war'] }, ...over }), roll('event', 6))
  const withBoard = (id: PlayerId, board: CentralSlot[] = [settlementA(), road(), settlementB()], over: Partial<PlayerState> = {}) =>
    makePlayer(id, { principality: board, playedCards: playedFor(board), ...over })
  const site = (slotIndex: number, expansionSlotIndex: number) => ({ slotIndex, expansionSlotIndex })
  const pick = (slotIndex: number, expansionSlotIndex: number) => ({ type: 'CHOOSE_PLACED_CARD' as const, slotIndex, expansionSlotIndex })

  it('makes the roller pick the opponent’s unit first, then the opponent picks the roller’s', () => {
    const host = withBoard('host', [settlementA(['knight-conrad', 'fleet-ore']), road(), settlementB()])
    const guest = withBoard('guest', [settlementA(['knight-karl', null]), road(), settlementB(['fleet-wool', null])])
    let s = civilWar(host, guest)
    expect(s.phase).toBe('event-resolution')
    expect(s.pendingChoices[0]).toEqual({ kind: 'placedCard', player: 'host', owner: 'guest', reason: 'civilWar', options: [site(0, 0), site(2, 0)] })

    s = applyAction(s, 'host', pick(2, 0))
    expect(s.players.guest.hand).toEqual(['fleet-wool'])
    expect(s.players.guest.principality[2].expansionSlots).toEqual([null, null])
    expect(s.players.guest.playedCards).not.toContain('fleet-wool')
    expect(s.pendingChoices[0]).toEqual({ kind: 'placedCard', player: 'guest', owner: 'host', reason: 'civilWar', options: [site(0, 0), site(0, 1)] })

    s = applyAction(s, 'guest', pick(0, 0))
    expect(s.players.host.hand).toEqual(['knight-conrad'])
    expect(s.players.host.playedCards).toContain('fleet-ore')
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(res(s.players.host).gold).toBe(1)  // production ran after the picks
    expect(s.eventLog.filter(e => e.type === 'returned-to-hand').map(e => [e.player, e.payload?.cardId]))
      .toEqual([['guest', 'fleet-wool'], ['host', 'knight-conrad']])
  })

  it('rejects a pick by the wrong player or of a card that is not an option', () => {
    const host = withBoard('host', [settlementA(['knight-conrad', null]), road(), settlementB()])
    const guest = withBoard('guest', [settlementA(['knight-karl', 'abbey']), road(), settlementB(['fleet-wool', null])])
    const s = civilWar(host, guest)
    expect(applyAction(s, 'guest', pick(0, 0))).toBe(s)
    expect(applyAction(s, 'host', pick(0, 1))).toBe(s)   // the Abbey is a Building
    expect(applyAction(s, 'host', pick(2, 1))).toBe(s)   // empty site
    expect(applyAction(s, 'host', { type: 'CHOOSE_RESOURCE', resource: 'ore' })).toBe(s)
  })

  it('returns a player’s only unit without asking and leaves a player without units alone', () => {
    const host = withBoard('host', [settlementA(['knight-conrad', null]), road(), settlementB()])
    const guest = withBoard('guest')
    const s = civilWar(host, guest)
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(s.players.host.hand).toEqual(['knight-conrad'])
    expect(s.players.host.principality[0].expansionSlots).toEqual([null, null])
    expect(s.players.guest).toEqual({ ...guest, regions: s.players.guest.regions })
  })

  it('protects the units in a City with a Church, but not units elsewhere', () => {
    const guest = withBoard('guest', [settlementA(['church', 'knight-karl', null, null]), road(), settlementB(['fleet-wool', null])])
    const s = civilWar(withBoard('host'), guest)
    expect(s.players.guest.hand).toEqual(['fleet-wool'])
    expect(s.players.guest.playedCards).toContain('knight-karl')
  })

  it('leaves a player alone whose units are all in a City with a Church', () => {
    const guest = withBoard('guest', [settlementA(['church', 'knight-karl', 'fleet-wool', null]), road(), settlementB()])
    const s = civilWar(withBoard('host'), guest)
    expect(s.players.guest.hand).toEqual([])
    expect(s.phase).toBe('action')
  })

  it('makes both players over the limit discard right away, roller first, before production', () => {
    const host = withBoard('host', [settlementA(['knight-conrad', null]), road(), settlementB()], { hand: ['abbey', 'smithy', 'mint'] })
    const guest = withBoard('guest', [settlementA(['fleet-wool', null]), road(), settlementB()], { hand: ['abbey', 'smithy', 'mint'] })
    let s = civilWar(host, guest, { decks: { ...emptyDecks(), event: ['event-civil-war'], 'stack-2': ['library'] } })
    expect(s.phase).toBe('event-resolution')
    expect(s.pendingChoices).toEqual([{ kind: 'discard', player: 'host' }, { kind: 'discard', player: 'guest' }])
    expect(res(s.players.host).gold).toBe(0)

    const discard = (cardId: string) => ({ type: 'DISCARD_TO_LIMIT' as const, discards: [{ cardId, toDeck: 'stack-2' as const }] })
    expect(applyAction(s, 'guest', discard('fleet-wool'))).toBe(s)
    expect(applyAction(s, 'host', { type: 'DISCARD_TO_LIMIT', discards: [] })).toBe(s)
    s = applyAction(s, 'host', discard('knight-conrad'))
    expect(s.players.host.hand).toEqual(['abbey', 'smithy', 'mint'])
    expect(s.decks['stack-2']).toEqual(['knight-conrad', 'library'])
    expect(s.phase).toBe('event-resolution')

    s = applyAction(s, 'guest', discard('abbey'))
    expect(s.players.guest.hand).toEqual(['smithy', 'mint', 'fleet-wool'])
    expect(s.decks['stack-2']).toEqual(['abbey', 'knight-conrad', 'library'])
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(res(s.players.host).gold).toBe(1)
  })

  it('moves the Knight Token when the Knight goes back to hand', () => {
    const host = withBoard('host', [settlementA(['knight-karl', null]), road(), settlementB()])
    expect(tokenHolders({ players: { host, guest: withBoard('guest') } }).knight).toBe('host')
    const s = civilWar(host, withBoard('guest'))
    expect(tokenHolders(s).knight).toBeNull()
  })

  it('lets the roller rebuild the returned unit the same turn', () => {
    const host = withBoard('host', [settlementA(['knight-conrad', null]), road(), settlementB()], { regions: regionsWith({ grain: 1, ore: 1 }) })
    let s = civilWar(host, withBoard('guest'))
    expect(s.players.host.hand).toEqual(['knight-conrad'])
    s = applyAction(s, 'host', { type: 'PLACE_EXPANSION', cardId: 'knight-conrad', slotIndex: 0, expansionSlotIndex: 0 })
    expect(s.players.host.principality[0].expansionSlots).toEqual(['knight-conrad', null])
    expect(s.players.host.hand).toEqual([])
  })
})
