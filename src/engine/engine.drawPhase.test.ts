import { describe, it, expect } from 'vitest'
import { applyAction, applyRoll, projectStateFor, searchCost } from './engine'
import { emptyDecks, regionsWith, makePlayer, makeState, res, roll } from './testing/fixtures'
import type { GameState, PlayerId } from './types'

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

describe('activity log', () => {
  const hidden = ['smithy', 'abbey', 'garrison', 'mint']
  const lastEntry = (s: GameState) => s.eventLog[s.eventLog.length - 1]
  const mentionsHiddenCard = (s: GameState) => hidden.some(id => JSON.stringify(s.eventLog).includes(id))

  it('logs a production roll with what each player gained', () => {
    const s = applyRoll(makeState({ phase: 'roll' }), roll('tournament', 4))  // forest-4, tournament tie
    expect(s.eventLog.map(e => e.type)).toEqual(['production'])
    expect(s.eventLog[0].payload).toEqual({ roll: 4, gains: { host: { lumber: 1 }, guest: { lumber: 1 } } })
  })

  it('puts the roll before the production it caused', () => {
    const s = applyAction(makeState({ phase: 'roll' }), 'host', { type: 'ROLL_DICE' })
    expect(s.eventLog[0].type).toBe('ROLL_DICE')
    expect(s.eventLog[0].payload).toEqual(s.lastRoll)
  })

  it('never names the cards drawn, searched, put back or exchanged', () => {
    const decks = { ...emptyDecks(), 'stack-1': ['smithy', 'abbey'], 'stack-2': ['garrison'] }
    let s = applyAction(makeState({ phase: 'draw', decks }), 'host', { type: 'DRAW_CARD', fromDeck: 'stack-1' })
    expect(lastEntry(s)).toMatchObject({ type: 'DRAW_CARD', payload: { deck: 'stack-1' } })

    const host = makePlayer('host', { regions: regionsWith({ lumber: 2 }) })
    s = applyAction(makeState({ phase: 'draw', decks, players: { host, guest: makePlayer('guest') } }), 'host',
      { type: 'SEARCH_STACK', deck: 'stack-1', payWith: ['lumber', 'lumber'] })
    s = applyAction(s, 'host', { type: 'TAKE_FROM_SEARCH', cardIds: ['smithy'] })
    expect(lastEntry(s)).toMatchObject({ type: 'TAKE_FROM_SEARCH', payload: { deck: 'stack-1', count: 1 } })
    expect(mentionsHiddenCard(s)).toBe(false)

    const holding = makePlayer('host', { hand: ['mint', 'smithy', 'abbey'] })
    s = applyAction(makeState({ phase: 'exchange', decks, players: { host: holding, guest: makePlayer('guest') } }), 'host',
      { type: 'EXCHANGE', cardId: 'mint', deck: 'stack-2' })
    expect(lastEntry(s)).toMatchObject({ type: 'EXCHANGE', payload: { deck: 'stack-2', searched: false } })
    expect(mentionsHiddenCard(s)).toBe(false)
  })

  it('adds nothing for a rejected action', () => {
    const s = makeState({ phase: 'action' })
    expect(applyAction(s, 'guest', { type: 'END_ACTION_PHASE' })).toBe(s)
  })

  it('keeps only the most recent entries', () => {
    const old = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, timestamp: 0, player: 'host' as PlayerId, type: 'old' }))
    const s = applyAction(makeState({ phase: 'action', eventLog: old }), 'host', { type: 'END_ACTION_PHASE' })
    expect(s.eventLog).toHaveLength(50)
    expect(lastEntry(s).type).toBe('END_ACTION_PHASE')
  })
})
