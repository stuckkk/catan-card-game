import { describe, it, expect } from 'vitest'
import {
  applyAction, applyRoll, rollDice, computePlayerStats, computeVP, projectForGuest,
  availableResources, getTradeRate,
} from './engine'
import type {
  GameState, PlayerState, PlayerId, Resources, ResourceType, RegionState, DiceRoll,
} from './types'

// ─── Test builders (deterministic, no RNG) ──────────────────────────────────

function res(over: Partial<Resources> = {}): Resources {
  return { wood: 0, wool: 0, gold: 0, brick: 0, ore: 0, grain: 0, ...over }
}

// Region id per resource type. productionNumber only matters for production tests.
const REGION_BY_RES: Record<ResourceType, string> = {
  wood: 'forest-2', wool: 'meadow-3', gold: 'river-2',
  brick: 'claypit-1', ore: 'mountain-1', grain: 'field-1',
}

const RES_TYPES: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']

/**
 * Build a starting-style board with one region of every resource type (so every
 * resource has a home, as in the real game), holding the given amounts. Amounts
 * over 3 spill into extra regions of that type. regions[0] is always forest-2.
 */
function regionsWith(over: Partial<Resources> = {}): RegionState[] {
  const regions: RegionState[] = RES_TYPES.map(t => ({
    regionId: REGION_BY_RES[t], storedResources: 0, expansionAbove: null, expansionBelow: null,
  }))
  for (const [r, amtRaw] of Object.entries(over) as [ResourceType, number][]) {
    let amt = amtRaw
    const base = regions.find(rg => rg.regionId === REGION_BY_RES[r])!
    base.storedResources = Math.min(3, amt)
    amt -= base.storedResources
    while (amt > 0) {
      const stored = Math.min(3, amt)
      regions.push({ regionId: REGION_BY_RES[r], storedResources: stored, expansionAbove: null, expansionBelow: null })
      amt -= stored
    }
  }
  return regions
}

function makePlayer(id: PlayerId, over: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    hand: [],
    principality: [
      { kind: 'settlement', cardId: 'settlement', regionIndices: [0], expansionSlots: [null, null] },
    ],
    regions: regionsWith(),
    playedCards: ['settlement'],
    drawnThisTurn: [],
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
    lastRoll: null,
    winner: null,
    decks: { green: [], red: [], brown: [], yellow: [], event: [] },
    discardPile: [],
    pendingTrade: null,
    pendingChoices: [],
    eventLog: [],
    ...over,
  }
}

// ─── Derived stats & advantages ──────────────────────────────────────────────

describe('computePlayerStats', () => {
  it('sums symbols, VP, and hand limit from played cards', () => {
    const p = makePlayer('host', { playedCards: ['settlement', 'knight', 'merchant', 'school'] })
    const s = computePlayerStats(p)
    expect(s.victoryPoints).toBe(1)     // settlement
    expect(s.strengthPoints).toBe(3)    // knight
    expect(s.tournamentPoints).toBe(3)  // knight (tournament value == strength)
    expect(s.commercePoints).toBe(1)    // merchant
    expect(s.progressPoints).toBe(1)    // school
    expect(s.handLimit).toBe(4)         // 3 + 1 progress
  })
})

describe('computeVP advantage tokens', () => {
  it('grants the Hero Token only at >=3 strength and strictly more than opponent', () => {
    const state = makeState({
      players: {
        host: makePlayer('host', { playedCards: ['settlement', 'knight'] }), // 3 strength
        guest: makePlayer('guest', { playedCards: ['settlement'] }),         // 0 strength
      },
    })
    expect(computeVP(state, 'host')).toBe(2) // settlement + hero
    expect(computeVP(state, 'guest')).toBe(1) // settlement only
  })

  it('withholds the Hero Token when strength is tied', () => {
    const state = makeState({
      players: {
        host: makePlayer('host', { playedCards: ['settlement', 'knight'] }),
        guest: makePlayer('guest', { playedCards: ['settlement', 'knight'] }),
      },
    })
    expect(computeVP(state, 'host')).toBe(1)
    expect(computeVP(state, 'guest')).toBe(1)
  })

  it('grants the Trade Token for a commerce majority', () => {
    const state = makeState({
      players: {
        host: makePlayer('host', { playedCards: ['settlement', 'market', 'merchant'] }), // 3 commerce
        guest: makePlayer('guest', { playedCards: ['settlement'] }),
      },
    })
    expect(computeVP(state, 'host')).toBe(2) // settlement + trade
  })
})

describe('victory detection', () => {
  it('sets winner when a player reaches the VP target', () => {
    const state = makeState({
      config: { vpTarget: 4, language: 'en' },
      players: {
        host: makePlayer('host', { playedCards: ['city', 'watchtower', 'knight'] }), // 2 + 1 + hero 1 = 4
        guest: makePlayer('guest'),
      },
    })
    // Any action triggers the post-action victory check.
    const next = applyAction(state, 'host', { type: 'TRADE_WITH_BANK', give: 'wood', receive: 'wood' })
    expect(next.winner).toBe('host')
  })
})

// ─── Dice, events, production ────────────────────────────────────────────────

describe('production', () => {
  it('adds 1 resource to regions matching the rolled number', () => {
    const state = makeState({ phase: 'roll' })
    const roll: DiceRoll = { eventSymbol: 'event', productionNumber: 2 } // forest-2 matches; empty event deck = no-op
    const next = applyRoll(state, roll)
    expect(next.players.host.regions[0].storedResources).toBe(1)
    expect(next.players.guest.regions[0].storedResources).toBe(1)
    expect(next.phase).toBe('action')
  })

  it('does not produce for regions whose number was not rolled', () => {
    const state = makeState({ phase: 'roll' })
    const next = applyRoll(state, { eventSymbol: 'event', productionNumber: 5 })
    expect(next.players.host.regions[0].storedResources).toBe(0)
  })

  it('yields +1 extra per Brown Expansion on the region, capped at capacity 3', () => {
    const host = makePlayer('host', {
      regions: [{ regionId: 'forest-2', storedResources: 2, expansionAbove: 'sawmill', expansionBelow: null }],
    })
    const state = makeState({ phase: 'roll', players: { host, guest: makePlayer('guest') } })
    const next = applyRoll(state, { eventSymbol: 'event', productionNumber: 2 })
    // yield = 2, stored 2 + 2 = 4 → clamped to 3
    expect(next.players.host.regions[0].storedResources).toBe(3)
  })
})

describe('event die', () => {
  it('Bandit purges Gold and Wool from a player holding more than 7 resources and skips production', () => {
    const host = makePlayer('host', { regions: regionsWith({ wood: 5, brick: 3, gold: 2, wool: 2 }) }) // total 12
    const guest = makePlayer('guest', { regions: regionsWith({ gold: 1, wool: 1 }) })                   // total 2
    const state = makeState({ phase: 'roll', players: { host, guest } })
    const next = applyRoll(state, { eventSymbol: 'bandit', productionNumber: 2 })
    expect(availableResources(next.players.host).gold).toBe(0)
    expect(availableResources(next.players.host).wool).toBe(0)
    expect(availableResources(next.players.host).wood).toBe(5)  // untouched
    expect(availableResources(next.players.guest).gold).toBe(1) // under threshold, safe
    expect(next.phase).toBe('action') // bandit replaces production
  })

  it('Harvest queues a choice for each player, then resumes production once both pick', () => {
    const state = makeState({ phase: 'roll', activePlayer: 'host' })
    const rolled = applyRoll(state, { eventSymbol: 'harvest', productionNumber: 2 })

    // Paused: both players owe a choice (active player first), production not yet run.
    expect(rolled.phase).toBe('event-resolution')
    expect(rolled.pendingChoices.map(c => c.player)).toEqual(['host', 'guest'])
    expect(rolled.pendingChoices[0].reason).toBe('harvest')
    expect(rolled.pendingChoices[0].options).toHaveLength(6)
    expect(availableResources(rolled.players.host).wood).toBe(0) // production held back

    // Host picks; guest's choice remains, still paused.
    const afterHost = applyAction(rolled, 'host', { type: 'CHOOSE_RESOURCE', resource: 'grain' })
    expect(afterHost.phase).toBe('event-resolution')
    expect(afterHost.pendingChoices.map(c => c.player)).toEqual(['guest'])
    expect(availableResources(afterHost.players.host).grain).toBe(1)

    // Guest picks; no choices remain, so production runs and the action phase begins.
    const done = applyAction(afterHost, 'guest', { type: 'CHOOSE_RESOURCE', resource: 'ore' })
    expect(done.pendingChoices).toHaveLength(0)
    expect(done.phase).toBe('action')
    expect(availableResources(done.players.guest).ore).toBe(1)
    expect(availableResources(done.players.host).wood).toBe(1)  // forest-2 produced on roll 2
    expect(availableResources(done.players.guest).wood).toBe(1)
  })
})

describe('trade event (B1 — choose a resource to take)', () => {
  // Host holds the Trade Token (3 commerce, strictly more than guest).
  const tradeHolder = (over: Partial<PlayerState> = {}) =>
    makePlayer('host', { playedCards: ['settlement', 'market', 'merchant'], ...over })

  it('offers only the resources the opponent holds, then moves the chosen one', () => {
    const state = makeState({
      phase: 'roll', activePlayer: 'host',
      players: {
        host: tradeHolder({ regions: regionsWith() }),
        guest: makePlayer('guest', { regions: regionsWith({ wood: 2, gold: 1 }) }),
      },
    })
    const rolled = applyRoll(state, { eventSymbol: 'trade', productionNumber: 5 }) // no region on 5

    expect(rolled.phase).toBe('event-resolution')
    expect(rolled.pendingChoices).toHaveLength(1)
    const choice = rolled.pendingChoices[0]
    expect(choice).toMatchObject({ player: 'host', reason: 'trade', takeFrom: 'guest' })
    expect(choice.options).toEqual(['wood', 'gold']) // only what the guest holds

    const done = applyAction(rolled, 'host', { type: 'CHOOSE_RESOURCE', resource: 'gold' })
    expect(done.pendingChoices).toHaveLength(0)
    expect(done.phase).toBe('action')
    expect(availableResources(done.players.host).gold).toBe(1)
    expect(availableResources(done.players.guest).gold).toBe(0)
    expect(availableResources(done.players.guest).wood).toBe(2) // untouched
  })

  it('still removes the resource from the opponent even when the taker has no room', () => {
    const state = makeState({
      phase: 'roll', activePlayer: 'host',
      players: {
        host: tradeHolder({ regions: regionsWith({ gold: 3 }) }), // gold region already full
        guest: makePlayer('guest', { regions: regionsWith({ gold: 1 }) }),
      },
    })
    const rolled = applyRoll(state, { eventSymbol: 'trade', productionNumber: 5 })
    const done = applyAction(rolled, 'host', { type: 'CHOOSE_RESOURCE', resource: 'gold' })
    expect(availableResources(done.players.guest).gold).toBe(0) // opponent still loses it
    expect(availableResources(done.players.host).gold).toBe(3)  // overflow lost, capped at 3
  })

  it('creates no choice and resumes immediately when the opponent has nothing', () => {
    const state = makeState({
      phase: 'roll', activePlayer: 'host',
      players: {
        host: tradeHolder({ regions: regionsWith() }),
        guest: makePlayer('guest', { regions: regionsWith() }), // empty
      },
    })
    const rolled = applyRoll(state, { eventSymbol: 'trade', productionNumber: 5 })
    expect(rolled.pendingChoices).toHaveLength(0)
    expect(rolled.phase).toBe('action')
  })

  it('ignores a CHOOSE_RESOURCE from a player who does not own the choice', () => {
    const state = makeState({
      phase: 'roll', activePlayer: 'host',
      players: {
        host: tradeHolder({ regions: regionsWith() }),
        guest: makePlayer('guest', { regions: regionsWith({ gold: 1 }) }),
      },
    })
    const rolled = applyRoll(state, { eventSymbol: 'trade', productionNumber: 5 })
    const unchanged = applyAction(rolled, 'guest', { type: 'CHOOSE_RESOURCE', resource: 'gold' })
    expect(unchanged.pendingChoices).toHaveLength(1) // choice still pending
    expect(availableResources(unchanged.players.guest).gold).toBe(1) // nothing moved
  })
})

describe('tournament event (B3 — Knights’ tournament)', () => {
  it('lets the player with the higher Knights’ tournament sum choose 1 free resource, then resumes production', () => {
    const state = makeState({
      phase: 'roll', activePlayer: 'host',
      players: {
        host: makePlayer('host', { playedCards: ['settlement', 'knight'] }),       // tournament 3
        guest: makePlayer('guest', { playedCards: ['settlement', 'militiaman'] }),  // tournament 1
      },
    })
    const rolled = applyRoll(state, { eventSymbol: 'tournament', productionNumber: 5 }) // no region on 5

    expect(rolled.phase).toBe('event-resolution')
    expect(rolled.pendingChoices).toHaveLength(1)
    expect(rolled.pendingChoices[0]).toMatchObject({ player: 'host', reason: 'tournament', takeFrom: null })
    expect(rolled.pendingChoices[0].options).toHaveLength(6) // free choice from the bank

    const done = applyAction(rolled, 'host', { type: 'CHOOSE_RESOURCE', resource: 'ore' })
    expect(done.pendingChoices).toHaveLength(0)
    expect(done.phase).toBe('action')
    expect(availableResources(done.players.host).ore).toBe(1)
    expect(availableResources(done.players.guest).ore).toBe(0) // from the bank; opponent untouched
  })

  it('does nothing on a tie (equal tournament sums), going straight to production', () => {
    const state = makeState({
      phase: 'roll', activePlayer: 'host',
      players: {
        host: makePlayer('host', { playedCards: ['settlement', 'swordsman'] }),   // tournament 2
        guest: makePlayer('guest', { playedCards: ['settlement', 'swordsman'] }),  // tournament 2
      },
    })
    const rolled = applyRoll(state, { eventSymbol: 'tournament', productionNumber: 5 })
    expect(rolled.pendingChoices).toHaveLength(0)
    expect(rolled.phase).toBe('action')
  })

  it('counts only Knights — other expansions contribute no tournament points', () => {
    const state = makeState({
      phase: 'roll', activePlayer: 'host',
      players: {
        // Non-Knight expansions (commerce + progress) grant 0 tournament points.
        host: makePlayer('host', { playedCards: ['settlement', 'market', 'library'] }),
        guest: makePlayer('guest', { playedCards: ['settlement', 'militiaman'] }), // tournament 1
      },
    })
    expect(computePlayerStats(state.players.host).tournamentPoints).toBe(0)
    const rolled = applyRoll(state, { eventSymbol: 'tournament', productionNumber: 5 })
    expect(rolled.pendingChoices).toHaveLength(1)
    expect(rolled.pendingChoices[0].player).toBe('guest') // a single Knight beats non-Knight cards
  })
})

describe('rollDice', () => {
  it('is deterministic given a fixed RNG', () => {
    const roll = rollDice(() => 0)
    expect(roll.eventSymbol).toBe('bandit')
    expect(roll.productionNumber).toBe(1)
  })

  it('weights the event-card face at 2 of the 6 faces', () => {
    // Faces: [bandit, trade, tournament, harvest, event, event] — indices 4 & 5 are both 'event'.
    expect(rollDice(() => 0.75).eventSymbol).toBe('event')      // floor(4.5) = 4
    expect(rollDice(() => 0.95).eventSymbol).toBe('event')      // floor(5.7) = 5
    expect(rollDice(() => 0.4).eventSymbol).toBe('tournament')  // floor(2.4) = 2
  })
})

// ─── Building & trade ────────────────────────────────────────────────────────

describe('build city', () => {
  it('upgrades a settlement to a city with 4 expansion slots and 2 VP', () => {
    const host = makePlayer('host', { regions: regionsWith({ grain: 2, ore: 3 }) })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'BUILD_CITY', slotIndex: 0 })
    const slot = next.players.host.principality[0]
    expect(slot.kind).toBe('city')
    expect(slot.expansionSlots).toHaveLength(4)
    expect(availableResources(next.players.host)).toEqual(res()) // fully paid
    expect(computePlayerStats(next.players.host).victoryPoints).toBe(2)
  })
})

describe('trade with bank', () => {
  it('uses the 3:1 standard rate by default', () => {
    const host = makePlayer('host', { regions: regionsWith({ wood: 3 }) })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'TRADE_WITH_BANK', give: 'wood', receive: 'grain' })
    expect(availableResources(next.players.host).wood).toBe(0)
    expect(availableResources(next.players.host).grain).toBe(1)
  })

  it('uses the 2:1 improved rate with the matching trade ship', () => {
    const host = makePlayer('host', {
      regions: regionsWith({ wood: 2 }),
      playedCards: ['settlement', 'trade-ship-wood'],
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'TRADE_WITH_BANK', give: 'wood', receive: 'grain' })
    expect(availableResources(next.players.host).wood).toBe(0)
    expect(availableResources(next.players.host).grain).toBe(1)
  })

  it('rejects a trade the player cannot afford', () => {
    const host = makePlayer('host', { regions: regionsWith({ wood: 2 }) })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'TRADE_WITH_BANK', give: 'wood', receive: 'grain' })
    expect(availableResources(next.players.host).wood).toBe(2) // unchanged
  })

  it('rejects trading a resource for itself', () => {
    const host = makePlayer('host', { regions: regionsWith({ wood: 3 }) })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'TRADE_WITH_BANK', give: 'wood', receive: 'wood' })
    expect(availableResources(next.players.host).wood).toBe(3) // unchanged
  })

  it('rejects trading outside the action phase', () => {
    const host = makePlayer('host', { regions: regionsWith({ wood: 3 }) })
    const state = makeState({ phase: 'roll', players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'TRADE_WITH_BANK', give: 'wood', receive: 'grain' })
    expect(availableResources(next.players.host).wood).toBe(3) // unchanged
    expect(availableResources(next.players.host).grain).toBe(0)
  })
})

// ─── Player-to-player trade ──────────────────────────────────────────────────

describe('player trade', () => {
  function setup() {
    const host = makePlayer('host', { regions: regionsWith({ wood: 2 }) })
    const guest = makePlayer('guest', { regions: regionsWith({ grain: 2 }) })
    return makeState({ players: { host, guest } })
  }

  it('moves resources both ways when the opponent accepts', () => {
    const state = applyAction(setup(), 'host', { type: 'PROPOSE_TRADE', give: { wood: 2 }, receive: { grain: 1 } })
    expect(state.pendingTrade).not.toBeNull()
    const next = applyAction(state, 'guest', { type: 'ACCEPT_TRADE' })
    expect(availableResources(next.players.host).wood).toBe(0)
    expect(availableResources(next.players.host).grain).toBe(1)
    expect(availableResources(next.players.guest).grain).toBe(1)
    expect(availableResources(next.players.guest).wood).toBe(2)
    expect(next.pendingTrade).toBeNull()
  })

  it('moves nothing and clears the offer on decline', () => {
    const state = applyAction(setup(), 'host', { type: 'PROPOSE_TRADE', give: { wood: 1 }, receive: { grain: 1 } })
    const next = applyAction(state, 'guest', { type: 'DECLINE_TRADE' })
    expect(next.pendingTrade).toBeNull()
    expect(availableResources(next.players.host).wood).toBe(2)
    expect(availableResources(next.players.guest).grain).toBe(2)
  })

  it('ignores an accept from the proposer themselves', () => {
    const state = applyAction(setup(), 'host', { type: 'PROPOSE_TRADE', give: { wood: 1 }, receive: { grain: 1 } })
    const next = applyAction(state, 'host', { type: 'ACCEPT_TRADE' })
    expect(next.pendingTrade).not.toBeNull() // still awaiting the opponent
    expect(availableResources(next.players.host).wood).toBe(2)
  })

  it('rejects a proposal the proposer cannot afford', () => {
    const next = applyAction(setup(), 'host', { type: 'PROPOSE_TRADE', give: { wood: 5 }, receive: { grain: 1 } })
    expect(next.pendingTrade).toBeNull()
  })
})

// ─── Demolish ────────────────────────────────────────────────────────────────

describe('demolish', () => {
  it('removes a placed expansion to the discard pile for free', () => {
    const host = makePlayer('host', {
      principality: [
        { kind: 'settlement', cardId: 'settlement', regionIndices: [0], expansionSlots: ['knight', null] },
      ],
      playedCards: ['settlement', 'knight'],
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'DEMOLISH', slotIndex: 0, expansionSlotIndex: 0 })
    expect(next.players.host.principality[0].expansionSlots[0]).toBeNull()
    expect(next.players.host.playedCards).not.toContain('knight')
    expect(next.discardPile).toContain('knight')
  })
})

// ─── Brown region expansions ─────────────────────────────────────────────────

describe('region (brown) expansions', () => {
  it('places a brown card on a region, paying its cost', () => {
    const host = makePlayer('host', { hand: ['sawmill'], regions: regionsWith({ wood: 2 }) })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'PLACE_REGION_EXPANSION', cardId: 'sawmill', regionIndex: 0, position: 'above' })
    expect(next.players.host.regions[0].expansionAbove).toBe('sawmill')
    expect(next.players.host.hand).not.toContain('sawmill')
    expect(availableResources(next.players.host).wood).toBe(0)
    expect(next.players.host.playedCards).toContain('sawmill')
  })

  it('rejects placing on an occupied region slot', () => {
    const host = makePlayer('host', {
      hand: ['sawmill'],
      regions: [{ regionId: 'forest-2', storedResources: 2, expansionAbove: 'forge', expansionBelow: null }],
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'PLACE_REGION_EXPANSION', cardId: 'sawmill', regionIndex: 0, position: 'above' })
    expect(next.players.host.regions[0].expansionAbove).toBe('forge') // unchanged
    expect(next.players.host.hand).toContain('sawmill')
  })

  it('demolishes a brown region expansion to the discard', () => {
    const host = makePlayer('host', {
      regions: [{ regionId: 'forest-2', storedResources: 0, expansionAbove: 'sawmill', expansionBelow: null }],
      playedCards: ['settlement', 'sawmill'],
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'DEMOLISH_REGION_EXPANSION', regionIndex: 0, position: 'above' })
    expect(next.players.host.regions[0].expansionAbove).toBeNull()
    expect(next.discardPile).toContain('sawmill')
  })
})

// ─── Settlement / City (green & red) expansions ──────────────────────────────

describe('expansion placement', () => {
  it('places a green card in a settlement slot, paying its cost, and its effect counts', () => {
    const host = makePlayer('host', {
      hand: ['knight'],
      regions: regionsWith({ ore: 3, wool: 1, grain: 1 }), // knight cost
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', {
      type: 'PLACE_EXPANSION', cardId: 'knight', slotIndex: 0, expansionSlotIndex: 0,
    })
    expect(next.players.host.principality[0].expansionSlots[0]).toBe('knight')
    expect(next.players.host.hand).not.toContain('knight')
    expect(next.players.host.playedCards).toContain('knight')
    expect(availableResources(next.players.host)).toEqual(res()) // fully paid
    // Effect is live: strength & tournament both rise to 3.
    const stats = computePlayerStats(next.players.host)
    expect(stats.strengthPoints).toBe(3)
    expect(stats.tournamentPoints).toBe(3)
  })

  it('makes a placed trade ship grant its 2:1 improved trade rate', () => {
    const host = makePlayer('host', {
      hand: ['trade-ship-wood'],
      regions: regionsWith({ wood: 1, wool: 1, gold: 1 }),
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', {
      type: 'PLACE_EXPANSION', cardId: 'trade-ship-wood', slotIndex: 0, expansionSlotIndex: 0,
    })
    expect(next.players.host.playedCards).toContain('trade-ship-wood')
    expect(getTradeRate(next.players.host, 'wood')).toBe(2)
    expect(getTradeRate(next.players.host, 'ore')).toBe(3) // others unaffected
  })

  it('places a red card on a city slot and counts its progress symbol and VP', () => {
    const host = makePlayer('host', {
      hand: ['cathedral'],
      principality: [
        { kind: 'city', cardId: 'city', regionIndices: [0], expansionSlots: [null, null, null, null] },
      ],
      playedCards: ['city'],
      regions: regionsWith({ brick: 3, grain: 2 }), // cathedral cost
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', {
      type: 'PLACE_EXPANSION', cardId: 'cathedral', slotIndex: 0, expansionSlotIndex: 0,
    })
    expect(next.players.host.principality[0].expansionSlots[0]).toBe('cathedral')
    expect(next.players.host.playedCards).toContain('cathedral')
    const stats = computePlayerStats(next.players.host)
    expect(stats.progressPoints).toBe(2)
    expect(stats.victoryPoints).toBe(3) // city 2 + cathedral directVP 1
  })

  it('rejects a red card on a (non-city) settlement slot', () => {
    const host = makePlayer('host', {
      hand: ['cathedral'],
      regions: regionsWith({ brick: 3, grain: 2 }),
    })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', {
      type: 'PLACE_EXPANSION', cardId: 'cathedral', slotIndex: 0, expansionSlotIndex: 0,
    })
    expect(next.players.host.principality[0].expansionSlots[0]).toBeNull()
    expect(next.players.host.hand).toContain('cathedral') // not consumed
  })

  it('rejects placing an expansion the player cannot afford', () => {
    const host = makePlayer('host', { hand: ['knight'] }) // no resources
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', {
      type: 'PLACE_EXPANSION', cardId: 'knight', slotIndex: 0, expansionSlotIndex: 0,
    })
    expect(next.players.host.principality[0].expansionSlots[0]).toBeNull()
    expect(next.players.host.hand).toContain('knight')
  })
})

// ─── Swap phase ──────────────────────────────────────────────────────────────

describe('free swap', () => {
  it('draws the top card, buries the discard, and passes the turn', () => {
    const host = makePlayer('host', { hand: ['knight'] })
    const state = makeState({
      phase: 'swap',
      players: { host, guest: makePlayer('guest') },
      decks: { green: ['a', 'b', 'top'], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', { type: 'FREE_SWAP', discardCardId: 'knight', fromDeck: 'green' })
    expect(next.players.host.hand).toEqual(['top'])
    expect(next.decks.green).toEqual(['knight', 'a', 'b']) // discard buried at the bottom
    expect(next.phase).toBe('roll')
    expect(next.activePlayer).toBe('guest')
  })
})

describe('paid swap', () => {
  it('pays 2 resources to fetch a named card from a deck', () => {
    const host = makePlayer('host', { hand: ['knight'], regions: regionsWith({ gold: 2 }) })
    const state = makeState({
      phase: 'swap',
      players: { host, guest: makePlayer('guest') },
      decks: { green: ['merchant', 'school'], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', {
      type: 'PAID_SWAP', discardCardId: 'knight', fromDeck: 'green',
      searchCardId: 'merchant', searchDeck: 'green', payWith: 'gold',
    })
    expect(next.players.host.hand).toContain('merchant')
    expect(next.players.host.hand).not.toContain('knight')
    expect(availableResources(next.players.host).gold).toBe(0)
    expect(next.decks.green).not.toContain('merchant')
    expect(next.decks.green).toContain('knight') // buried
    expect(next.activePlayer).toBe('guest')
  })

  it('rejects a paid swap the player cannot pay for', () => {
    const host = makePlayer('host', { hand: ['knight'], regions: regionsWith({ gold: 1 }) })
    const state = makeState({
      phase: 'swap',
      players: { host, guest: makePlayer('guest') },
      decks: { green: ['merchant'], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', {
      type: 'PAID_SWAP', discardCardId: 'knight', fromDeck: 'green',
      searchCardId: 'merchant', searchDeck: 'green', payWith: 'gold',
    })
    expect(next.players.host.hand).toEqual(['knight']) // unchanged
    expect(next.activePlayer).toBe('host')
  })
})

describe('discard to hand limit', () => {
  it('discards down to the limit and advances to the swap phase', () => {
    const host = makePlayer('host', { hand: ['a', 'b', 'c', 'd'] }) // limit 3
    const state = makeState({ phase: 'hand-check', players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'DISCARD_TO_LIMIT', cardIds: ['a'] })
    expect(next.players.host.hand).toHaveLength(3)
    expect(next.discardPile).toContain('a')
    expect(next.phase).toBe('swap')
  })

  it('stays in hand-check (no auto-draw) when discarding leaves the hand below the limit', () => {
    const host = makePlayer('host', { hand: ['a', 'b', 'c', 'd'] }) // limit 3
    const state = makeState({
      phase: 'hand-check',
      players: { host, guest: makePlayer('guest') },
      decks: { green: ['knight'], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', { type: 'DISCARD_TO_LIMIT', cardIds: ['a', 'b', 'c'] })
    expect(next.players.host.hand).toEqual(['d']) // 1 card, below limit
    expect(next.phase).toBe('hand-check')         // waiting to draw
    expect(next.decks.green).toEqual(['knight'])  // nothing auto-drawn
  })
})

describe('playing action cards', () => {
  it('plays Celebration: gains 1 gold and discards the card', () => {
    const host = makePlayer('host', { hand: ['celebration'], regions: regionsWith({ gold: 1 }) })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'celebration' })
    expect(availableResources(next.players.host).gold).toBe(2)
    expect(next.players.host.hand).toEqual([])
    expect(next.discardPile).toContain('celebration')
    expect(next.players.host.playedCards).not.toContain('celebration')
  })

  it('plays Invention: grants a permanent +1 progress (kept in playedCards)', () => {
    const host = makePlayer('host', { hand: ['invention'] })
    const state = makeState({ players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'invention' })
    expect(next.players.host.hand).toEqual([])
    expect(next.players.host.playedCards).toContain('invention')
    expect(next.discardPile).not.toContain('invention')
    const stats = computePlayerStats(next.players.host)
    expect(stats.progressPoints).toBe(1)
    expect(stats.handLimit).toBe(4) // 3 + 1 progress, persists with the card
  })

  it('plays Ambush: opens a resource choice, then steals the chosen resource', () => {
    const host = makePlayer('host', { hand: ['ambush'], regions: regionsWith() })
    const guest = makePlayer('guest', { regions: regionsWith({ wood: 2 }) })
    const state = makeState({ players: { host, guest } })

    const played = applyAction(state, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'ambush' })
    expect(played.phase).toBe('action')
    expect(played.pendingChoices).toHaveLength(1)
    expect(played.pendingChoices[0]).toMatchObject({ player: 'host', reason: 'trade', takeFrom: 'guest' })
    expect(played.pendingChoices[0].options).toContain('wood')

    const done = applyAction(played, 'host', { type: 'CHOOSE_RESOURCE', resource: 'wood' })
    expect(availableResources(done.players.host).wood).toBe(1)
    expect(availableResources(done.players.guest).wood).toBe(1)
    expect(done.pendingChoices).toHaveLength(0)
  })

  it('resolving an Ambush choice does not trigger production a second time', () => {
    // host's wood region (forest-2) produces on a roll of 2; if production ran again
    // after the steal, host would gain an extra wood beyond the single stolen one.
    const host = makePlayer('host', { hand: ['ambush'], regions: regionsWith() })
    const guest = makePlayer('guest', { regions: regionsWith({ wood: 2 }) })
    const state = makeState({
      players: { host, guest },
      lastRoll: { eventSymbol: 'event', productionNumber: 2 } as DiceRoll,
    })
    const played = applyAction(state, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'ambush' })
    const done = applyAction(played, 'host', { type: 'CHOOSE_RESOURCE', resource: 'wood' })
    expect(availableResources(done.players.host).wood).toBe(1) // only the stolen wood
    expect(done.phase).toBe('action')
  })

  it('ignores PLAY_ACTION_CARD outside the action phase', () => {
    const host = makePlayer('host', { hand: ['celebration'], regions: regionsWith({ gold: 1 }) })
    const state = makeState({ phase: 'roll', players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'celebration' })
    expect(next.players.host.hand).toEqual(['celebration'])
    expect(availableResources(next.players.host).gold).toBe(1)
  })
})

describe('player-chosen refill draw', () => {
  it('draws from the chosen deck and advances to swap at the limit', () => {
    const host = makePlayer('host', { hand: ['knight', 'knight'] }) // 2 cards, limit 3
    const state = makeState({
      phase: 'hand-check',
      players: { host, guest: makePlayer('guest') },
      decks: { green: [], red: [], brown: [], yellow: ['ambush'], event: [] },
    })
    const next = applyAction(state, 'host', { type: 'DRAW_TO_LIMIT', fromDeck: 'yellow' })
    expect(next.players.host.hand).toContain('ambush')
    expect(next.players.host.hand).toHaveLength(3)
    expect(next.decks.yellow).toEqual([])
    expect(next.phase).toBe('swap')
  })

  it('advances to swap when all draw decks are exhausted even if below the limit', () => {
    const host = makePlayer('host', { hand: [] }) // 0 cards, limit 3, but no cards to draw
    const state = makeState({
      phase: 'hand-check',
      players: { host, guest: makePlayer('guest') },
      decks: { green: [], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', { type: 'DRAW_TO_LIMIT', fromDeck: 'green' })
    expect(next.players.host.hand).toEqual([])
    expect(next.phase).toBe('swap')
  })
})

describe('swap lock on cards drawn this turn', () => {
  it('records the drawn card in drawnThisTurn', () => {
    const host = makePlayer('host', { hand: ['knight', 'knight'] }) // 2 cards, limit 3
    const state = makeState({
      phase: 'hand-check',
      players: { host, guest: makePlayer('guest') },
      decks: { green: [], red: [], brown: [], yellow: ['ambush'], event: [] },
    })
    const next = applyAction(state, 'host', { type: 'DRAW_TO_LIMIT', fromDeck: 'yellow' })
    expect(next.players.host.drawnThisTurn).toEqual(['ambush'])
  })

  it('rejects swapping away a card drawn this turn (free swap)', () => {
    const host = makePlayer('host', { hand: ['knight'], drawnThisTurn: ['knight'] })
    const state = makeState({
      phase: 'swap',
      players: { host, guest: makePlayer('guest') },
      decks: { green: ['top'], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', { type: 'FREE_SWAP', discardCardId: 'knight', fromDeck: 'green' })
    expect(next.players.host.hand).toEqual(['knight']) // unchanged
    expect(next.phase).toBe('swap')
  })

  it('rejects swapping away a card drawn this turn (paid swap)', () => {
    const host = makePlayer('host', {
      hand: ['knight'], drawnThisTurn: ['knight'], regions: regionsWith({ gold: 2 }),
    })
    const state = makeState({
      phase: 'swap',
      players: { host, guest: makePlayer('guest') },
      decks: { green: ['merchant'], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', {
      type: 'PAID_SWAP', discardCardId: 'knight', fromDeck: 'green',
      searchCardId: 'merchant', searchDeck: 'green', payWith: 'gold',
    })
    expect(next.players.host.hand).toEqual(['knight']) // unchanged
    expect(availableResources(next.players.host).gold).toBe(2) // not charged
    expect(next.phase).toBe('swap')
  })

  it('allows swapping a duplicate when more copies are held than were drawn', () => {
    const host = makePlayer('host', { hand: ['knight', 'knight'], drawnThisTurn: ['knight'] })
    const state = makeState({
      phase: 'swap',
      players: { host, guest: makePlayer('guest') },
      decks: { green: ['top'], red: [], brown: [], yellow: [], event: [] },
    })
    const next = applyAction(state, 'host', { type: 'FREE_SWAP', discardCardId: 'knight', fromDeck: 'green' })
    expect(next.players.host.hand).toEqual(['knight', 'top'])
    expect(next.phase).toBe('roll')
  })

  it('clears drawnThisTurn when the end-of-turn check begins', () => {
    const host = makePlayer('host', { hand: ['a', 'b', 'c'], drawnThisTurn: ['stale'] }) // at limit
    const state = makeState({ phase: 'action', players: { host, guest: makePlayer('guest') } })
    const next = applyAction(state, 'host', { type: 'END_ACTION_PHASE' })
    expect(next.players.host.drawnThisTurn).toEqual([])
    expect(next.phase).toBe('swap')
  })
})

// ─── Projection ──────────────────────────────────────────────────────────────

describe('projectForGuest', () => {
  it('redacts the host hand to a count and leaves the guest hand intact', () => {
    const host = makePlayer('host', { hand: ['knight', 'merchant'] })
    const guest = makePlayer('guest', { hand: ['school'] })
    const projected = projectForGuest(makeState({ players: { host, guest } }))
    expect(projected.players.host.hand).toBe(2)
    expect(projected.players.guest.hand).toEqual(['school'])
  })
})
