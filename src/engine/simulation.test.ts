import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyAction, createInitialState, availableResources, computePlayerStats, searchCost, setupChooser } from './engine'
import { ALL_DRAW_CARDS, DRAW_STACK_IDS, getCard } from './cards'
import { ALL_RESOURCE_TYPES } from './board'
import type { GameAction, GameState, PlayerId, ResourceType } from './types'

// Plays whole games with simple bots to shake out soft-locks and broken invariants across
// the full rule set (setup, events, building, action cards, drawing, exchanging).

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sorted = (a: string[]) => [...a].sort()

/** Every Expansion Card must be somewhere: a stack, a hand, a board, or the discard pile. */
function expansionCardsInPlay(s: GameState): string[] {
  const onBoards = (['host', 'guest'] as PlayerId[]).flatMap(p =>
    s.players[p].playedCards.filter(id => !['road', 'settlement', 'city'].includes(id)))
  return [
    ...DRAW_STACK_IDS.flatMap(d => s.decks[d]),
    ...s.players.host.hand, ...s.players.guest.hand,
    ...onBoards, ...s.discardPile,
  ]
}

function checkInvariants(s: GameState) {
  expect(sorted(expansionCardsInPlay(s))).toEqual(sorted(ALL_DRAW_CARDS))
  expect(s.decks.event).toHaveLength(7)
  for (const p of ['host', 'guest'] as PlayerId[]) {
    const player = s.players[p]
    for (const r of player.regions) expect(r.storedResources).toBeGreaterThanOrEqual(0)
    for (const r of player.regions) expect(r.storedResources).toBeLessThanOrEqual(3)
    // Placed expansions and playedCards agree.
    const placed = player.principality.flatMap(slot => slot.expansionSlots.filter((c): c is string => !!c))
    expect(sorted(placed)).toEqual(sorted(player.playedCards.filter(id => getCard(id).category === 'expansion')))
    // Every corner index points at a real region.
    for (const slot of player.principality) for (const ri of slot.regionIndices) expect(player.regions[ri]).toBeDefined()
  }
  const builtSettlements = (['host', 'guest'] as PlayerId[])
    .reduce((n, p) => n + s.players[p].principality.filter(x => x.kind !== 'road' && x.kind !== 'empty-settlement').length, 0)
  expect(builtSettlements).toBe(4 + (5 - s.supply.settlement))
  expect(s.regionStack.length).toBe(11 - 2 * (5 - s.supply.settlement))
}

/** The player who must act next. */
function actor(s: GameState): PlayerId {
  if (s.search) return s.search.player
  if (s.phase === 'setup') return setupChooser(s)!
  return s.pendingChoices[0]?.player ?? s.activePlayer
}

function pay(s: GameState, p: PlayerId, n: number): ResourceType[] {
  const r = availableResources(s.players[p])
  const out: ResourceType[] = []
  for (const t of ALL_RESOURCE_TYPES) while (r[t] > 0 && out.length < n) { out.push(t); r[t]-- }
  return out
}

/** Try a handful of plausible action-phase moves; returns the first that changes the state. */
function actionPhaseMoves(s: GameState, p: PlayerId, rng: () => number): GameAction[] {
  const me = s.players[p]
  const moves: GameAction[] = []
  me.principality.forEach((slot, i) => {
    if (slot.kind === 'empty-settlement') {
      if (me.hand.includes('scout') && s.regionStack.length >= 2) {
        moves.push({ type: 'BUILD_SETTLEMENT', slotIndex: i, scoutRegionIds: [s.regionStack[0], s.regionStack[1]] })
      }
      moves.push({ type: 'BUILD_SETTLEMENT', slotIndex: i })
    }
    if (slot.kind === 'settlement') moves.push({ type: 'BUILD_CITY', slotIndex: i })
    slot.expansionSlots.forEach((c, j) => {
      for (const card of me.hand) if (!c) moves.push({ type: 'PLACE_EXPANSION', cardId: card, slotIndex: i, expansionSlotIndex: j })
      if (c && rng() < 0.02) moves.push({ type: 'DEMOLISH', slotIndex: i, expansionSlotIndex: j })
    })
  })
  moves.push({ type: 'BUILD_ROAD', side: rng() < 0.5 ? 'left' : 'right' })
  const give = ALL_RESOURCE_TYPES[Math.floor(rng() * 6)]
  const want = ALL_RESOURCE_TYPES[Math.floor(rng() * 6)]
  moves.push({ type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: [give], receive: [want] } })
  moves.push({ type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: [want], give: [want] } })
  moves.push({ type: 'TRADE_WITH_BANK', give, receive: want })
  return moves
}

function step(s: GameState, rng: () => number): GameState {
  const p = actor(s)
  const me = s.players[p]
  const tryAll = (moves: GameAction[]) => {
    for (const m of moves) {
      const next = applyAction(s, p, m)
      if (next !== s) return next
    }
    return s
  }

  if (s.search) {
    const contents = s.decks[s.search.deck]
    const n = s.search.purpose === 'setup' ? Math.min(3, contents.length) : 1
    return applyAction(s, p, { type: 'TAKE_FROM_SEARCH', cardIds: contents.slice(-n) })
  }
  if (s.phase === 'setup') {
    const used = Object.values(s.setup.picked)
    return applyAction(s, p, { type: 'SEARCH_STACK', deck: DRAW_STACK_IDS.find(d => !used.includes(d) && s.decks[d].length > 0)! })
  }
  if (s.pendingChoices.length > 0) {
    const options = s.pendingChoices[0].options
    return applyAction(s, p, { type: 'CHOOSE_RESOURCE', resource: options[Math.floor(rng() * options.length)] })
  }
  switch (s.phase) {
    case 'roll': {
      if (me.hand.includes('alchemist') && rng() < 0.5) {
        const next = applyAction(s, p, { type: 'PLAY_ACTION_CARD', cardId: 'alchemist', params: { productionNumber: 3 } })
        if (next !== s) return next
      }
      return applyAction(s, p, { type: 'ROLL_DICE' })
    }
    case 'action': {
      if (rng() < 0.75) {
        const next = tryAll(actionPhaseMoves(s, p, rng).sort(() => rng() - 0.5))
        if (next !== s) return next
      }
      return applyAction(s, p, { type: 'END_ACTION_PHASE' })
    }
    case 'draw': {
      const limit = computePlayerStats(me).handLimit
      if (me.hand.length > limit) {
        return applyAction(s, p, {
          type: 'DISCARD_TO_LIMIT',
          discards: me.hand.slice(0, me.hand.length - limit).map((cardId, i) => ({ cardId, toDeck: DRAW_STACK_IDS[i % 5] })),
        })
      }
      const deck = DRAW_STACK_IDS.filter(d => s.decks[d].length > 0)[Math.floor(rng() * 5) % Math.max(1, DRAW_STACK_IDS.filter(d => s.decks[d].length > 0).length)]
      if (rng() < 0.3) {
        const next = applyAction(s, p, { type: 'SEARCH_STACK', deck, payWith: pay(s, p, searchCost(me)) })
        if (next !== s) return next
      }
      return applyAction(s, p, { type: 'DRAW_CARD', fromDeck: deck })
    }
    case 'exchange': {
      if (me.hand.length > 0 && rng() < 0.5) {
        const deck = DRAW_STACK_IDS[Math.floor(rng() * 5)]
        const payWith = rng() < 0.3 ? pay(s, p, searchCost(me)) : undefined
        const next = applyAction(s, p, { type: 'EXCHANGE', cardId: me.hand[0], deck, payWith })
        if (next !== s) return next
      }
      return applyAction(s, p, { type: 'SKIP_EXCHANGE' })
    }
    default:
      throw new Error(`stuck in phase ${s.phase}`)
  }
}

describe('simulated games', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('seed %i plays to a win or 300 turns without breaking invariants', seed => {
    const rng = mulberry32(seed)
    vi.spyOn(Math, 'random').mockImplementation(rng)
    let s = createInitialState({ vpTarget: 12, language: 'en' }, rng)
    checkInvariants(s)

    let steps = 0
    while (!s.winner && s.turn < 300) {
      const next = step(s, rng)
      expect(next, `no progress in phase ${s.phase} (turn ${s.turn})`).not.toBe(s)
      s = next
      checkInvariants(s)
      if (++steps > 20000) throw new Error('runaway game')
    }
    expect(s.turn).toBeGreaterThan(1)
  })
})
