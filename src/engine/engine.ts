import type {
  GameState, PlayerState, PlayerId, ResourceType, Resources, GameAction, ProjectedState,
  DiceRoll, EventSymbol, ProductionNumber, DeckId, DrawStackId, CentralSlot, PlayerStats,
  ActionCardParams, DeclarativeEffect, GameEvent,
} from './types'
import { getCard, CARD_REGISTRY, ALL_DRAW_CARDS, DRAW_STACK_IDS, DEFAULT_EVENT_DECK, SCOUT } from './cards'
import { getRegion, STARTING_REGIONS, STACK_REGIONS } from './regions'
import {
  ALL_RESOURCE_TYPES, availableResources, canAfford, countResources, spendFromRegions, addToRegions,
  shuffle, isSettlementLike, regionsBorderingCards,
} from './board'

export { availableResources } from './board'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function opponent(player: PlayerId): PlayerId {
  return player === 'host' ? 'guest' : 'host'
}

/** Return a copy of `list` with the first occurrence of `item` removed. */
function removeFirst(list: string[], item: string): string[] {
  const idx = list.indexOf(item)
  if (idx === -1) return [...list]
  const copy = [...list]
  copy.splice(idx, 1)
  return copy
}

/** Remove every item of `items` (as a multiset) from `list`; null if any is missing. */
function removeAll(list: string[], items: string[]): string[] | null {
  let rest = [...list]
  for (const item of items) {
    if (!rest.includes(item)) return null
    rest = removeFirst(rest, item)
  }
  return rest
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 9)
}

/** Append an entry to the activity log. Payloads hold public information only: they reach
 *  both players, so never a card id from a hand or a stack. */
function logEvent(state: GameState, player: PlayerId, type: string, payload?: Record<string, unknown>): GameState {
  return { ...state, eventLog: [...state.eventLog, makeEvent(player, type, payload)] }
}

function makeEvent(player: PlayerId, type: string, payload?: Record<string, unknown>): GameEvent {
  return { id: nanoid(), timestamp: Date.now(), player, type, payload }
}

/** How much of each resource `to` has more of than `from` (only the positive differences). */
function resourceGain(from: Resources, to: Resources): Partial<Resources> {
  const out: Partial<Resources> = {}
  for (const r of ALL_RESOURCE_TYPES) if (to[r] > from[r]) out[r] = to[r] - from[r]
  return out
}

function withPlayer(state: GameState, id: PlayerId, player: PlayerState): GameState {
  return { ...state, players: { ...state.players, [id]: player } }
}

function effectsOf(player: PlayerState): DeclarativeEffect[] {
  return player.playedCards.flatMap(id => getCard(id).effects)
}

const isDrawStack = (deck: string): deck is DrawStackId => (DRAW_STACK_IDS as string[]).includes(deck)

// ─── Stats / Derived Values ───────────────────────────────────────────────────

export function computePlayerStats(player: PlayerState): PlayerStats {
  let vp = 0, strength = 0, commerce = 0, tournament = 0, handLimit = 3
  let strengthPerKnight = 0, commercePerFleet = 0
  const knights = player.playedCards.filter(id => getCard(id).expansionKind === 'knight').length
  const fleets = player.playedCards.filter(id => getCard(id).expansionKind === 'fleet').length

  for (const cardId of player.playedCards) {
    const def = getCard(cardId)
    vp += def.directVP ?? 0
    for (const effect of def.effects) {
      if (effect.type === 'GRANT_SYMBOL') {
        if (effect.symbol === 'strength') strength += effect.amount
        if (effect.symbol === 'commerce') commerce += effect.amount
        if (effect.symbol === 'tournament') tournament += effect.amount
      }
      if (effect.type === 'INCREASE_HAND_LIMIT') handLimit += effect.amount
      if (effect.type === 'STRENGTH_PER_KNIGHT') strengthPerKnight += effect.amount
      if (effect.type === 'COMMERCE_PER_FLEET') commercePerFleet += effect.amount
    }
  }

  return {
    victoryPoints: vp,
    strengthPoints: strength + strengthPerKnight * knights,
    commercePoints: commerce + commercePerFleet * fleets,
    tournamentPoints: tournament,
    handLimit,
  }
}

type BoardOnly = Pick<GameState, 'players'> | Pick<ProjectedState, 'players'>

/** Who holds the Knight Token and the Windmill Token (GAME_LOGIC.md §7). Only uses public
 *  board state, so it works on a ProjectedState too. */
export function tokenHolders(state: BoardOnly): { knight: PlayerId | null; windmill: PlayerId | null } {
  const host = computePlayerStats(state.players.host as PlayerState)
  const guest = computePlayerStats(state.players.guest as PlayerState)
  const hasCity = (p: PlayerId) => state.players[p].principality.some(s => s.kind === 'city')

  const knight = host.strengthPoints > guest.strengthPoints ? 'host'
    : guest.strengthPoints > host.strengthPoints ? 'guest' : null
  const leader = host.commercePoints > guest.commercePoints ? 'host'
    : guest.commercePoints > host.commercePoints ? 'guest' : null
  const windmill = leader && hasCity(leader) ? leader : null
  return { knight, windmill }
}

export function computeVP(state: BoardOnly, playerId: PlayerId): number {
  const tokens = tokenHolders(state)
  return computePlayerStats(state.players[playerId] as PlayerState).victoryPoints
    + (tokens.knight === playerId ? 1 : 0)
    + (tokens.windmill === playerId ? 1 : 0)
}

/** Action Cards are locked until both players together have at least 7 VP (Scout excepted). */
export function actionCardsUnlocked(state: BoardOnly): boolean {
  return computeVP(state, 'host') + computeVP(state, 'guest') >= 7
}

/** Victory is only checked for the active player, during their own turn (GAME_LOGIC.md §1). */
function checkVictory(state: GameState): PlayerId | null {
  if (state.winner) return state.winner
  if (state.phase === 'setup') return null
  return computeVP(state, state.activePlayer) >= state.config.vpTarget ? state.activePlayer : null
}

/** Bank trade rate for a resource: 3, or better with a Trade Fleet (2) or Mint (gold 1). */
export function getTradeRate(player: PlayerState, resource: ResourceType): 1 | 2 | 3 {
  let rate: 1 | 2 | 3 = 3
  for (const e of effectsOf(player)) {
    if (e.type === 'IMPROVED_TRADE' && e.resource === resource && e.rate < rate) rate = e.rate
  }
  return rate
}

/** Resources a Search costs: 2, or 1 with a Town Hall. */
export function searchCost(player: PlayerState): number {
  return effectsOf(player).some(e => e.type === 'SEARCH_DISCOUNT') ? 1 : 2
}

/** The player who picks starting cards next during setup (first player, then the other). */
export function setupChooser(state: Pick<GameState, 'setup'>): PlayerId | null {
  const { firstPlayer, picked } = state.setup
  if (!picked[firstPlayer]) return firstPlayer
  if (!picked[opponent(firstPlayer)]) return opponent(firstPlayer)
  return null
}

// ─── Production ───────────────────────────────────────────────────────────────

/** Region indices whose production is doubled by a neighbouring production building. */
function doubledRegions(player: PlayerState): Set<number> {
  const out = new Set<number>()
  for (const resource of ALL_RESOURCE_TYPES) {
    const doublers = regionsBorderingCards(player, id =>
      getCard(id).effects.some(e => e.type === 'DOUBLE_PRODUCTION' && e.resource === resource))
    for (const ri of doublers.keys()) {
      if (getRegion(player.regions[ri].regionId).resourceType === resource) out.add(ri)
    }
  }
  return out
}

function produceForPlayer(player: PlayerState, roll: ProductionNumber): PlayerState {
  const doubled = doubledRegions(player)
  const regions = player.regions.map((region, i) => {
    if (getRegion(region.regionId).productionNumber !== roll) return region
    const gain = doubled.has(i) ? 2 : 1
    // Capacity is 3; anything beyond that is lost.
    return { ...region, storedResources: Math.min(3, region.storedResources + gain) }
  })
  return { ...player, regions }
}

// ─── Game Initialization ──────────────────────────────────────────────────────

function makeInitialPlayer(id: PlayerId, rng: () => number): PlayerState {
  // The 6 starting Regions, one per resource, in a random initial arrangement the player may
  // rearrange during setup. Indices 0–2 are the top row (spaces 1–3), 3–5 the bottom (4–6).
  // Each starts with 1 resource.
  const regions = shuffle(STARTING_REGIONS, rng).map(rd => ({ regionId: rd.id, storedResources: 1 }))
  const principality: CentralSlot[] = [
    { kind: 'settlement', cardId: 'settlement', regionIndices: [0, 3, 1, 4], expansionSlots: [null, null] },
    { kind: 'road', cardId: 'road', regionIndices: [], expansionSlots: [] },
    { kind: 'settlement', cardId: 'settlement', regionIndices: [1, 4, 2, 5], expansionSlots: [null, null] },
  ]
  return { id, hand: [], principality, regions, playedCards: ['settlement', 'road', 'settlement'] }
}

export function createInitialState(
  config: { vpTarget: number; language: 'en' | 'de' },
  rng: () => number = Math.random,
): GameState {
  // All Expansion Cards form a single shuffled pile, split round-robin into 5 stacks.
  const stacks: Record<DrawStackId, string[]> = {
    'stack-1': [], 'stack-2': [], 'stack-3': [], 'stack-4': [], 'stack-5': [],
  }
  shuffle(ALL_DRAW_CARDS, rng).forEach((id, i) => stacks[DRAW_STACK_IDS[i % 5]].push(id))

  // Stand-in for the rulebook's die roll for first player.
  const firstPlayer: PlayerId = rng() < 0.5 ? 'host' : 'guest'

  return {
    sessionId: nanoid(),
    config: { vpTarget: config.vpTarget, language: config.language },
    players: { host: makeInitialPlayer('host', rng), guest: makeInitialPlayer('guest', rng) },
    activePlayer: firstPlayer,
    phase: 'setup',
    turn: 0,
    setup: { firstPlayer, picked: {} },
    lastRoll: null,
    alchemistNumber: null,
    winner: null,
    decks: { ...stacks, event: shuffle(DEFAULT_EVENT_DECK, rng) },
    regionStack: shuffle(STACK_REGIONS.map(r => r.id), rng),
    supply: { road: 7, settlement: 5, city: 7 },
    discardPile: [],
    search: null,
    pendingTrade: null,
    pendingChoices: [],
    eventLog: [],
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function applySwapStartingRegions(state: GameState, actingPlayer: PlayerId, a: number, b: number): GameState {
  if (state.phase !== 'setup' || state.setup.picked[actingPlayer]) return state
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < 6
  if (!valid(a) || !valid(b) || a === b) return state
  const regions = [...state.players[actingPlayer].regions]
  ;[regions[a], regions[b]] = [regions[b], regions[a]]
  return withPlayer(state, actingPlayer, { ...state.players[actingPlayer], regions })
}

function finishSetupPick(state: GameState, player: PlayerId, deck: DrawStackId, cardIds: string[]): GameState | null {
  const rest = removeAll(state.decks[deck], cardIds)
  if (!rest) return null
  const s: GameState = {
    ...withPlayer(state, player, { ...state.players[player], hand: cardIds }),
    decks: { ...state.decks, [deck]: rest },
    setup: { ...state.setup, picked: { ...state.setup.picked, [player]: deck } },
    search: null,
  }
  if (setupChooser(s)) return s
  return { ...s, phase: 'roll', activePlayer: s.setup.firstPlayer, turn: 1 }
}

// ─── Event Resolution ─────────────────────────────────────────────────────────

/** Brigand Attack: count resources not next to a Garrison; above 7 loses all Ore and Wool. */
function brigandAttack(player: PlayerState): PlayerState {
  const guarded = regionsBorderingCards(player, id => getCard(id).effects.some(e => e.type === 'BRIGAND_PROTECTION'))
  const counted = player.regions.reduce((sum, r, i) => sum + (guarded.has(i) ? 0 : r.storedResources), 0)
  if (counted <= 7) return player
  const regions = player.regions.map(region => {
    const type = getRegion(region.regionId).resourceType
    return type === 'ore' || type === 'wool' ? { ...region, storedResources: 0 } : region
  })
  return { ...player, regions }
}

/** No Brigand Attacks in each player's first two turns (until the first player's 3rd turn). */
const BRIGAND_GRACE_TURNS = 4

function resolveEventSymbol(state: GameState, symbol: EventSymbol): GameState {
  const active = state.activePlayer

  switch (symbol) {
    case 'brigand': {
      if (state.turn <= BRIGAND_GRACE_TURNS) return { ...state, phase: 'production' }
      const players = { host: brigandAttack(state.players.host), guest: brigandAttack(state.players.guest) }
      const losses = {
        host: resourceGain(availableResources(players.host), availableResources(state.players.host)),
        guest: resourceGain(availableResources(players.guest), availableResources(state.players.guest)),
      }
      return logEvent({ ...state, players, phase: 'production' }, active, 'brigand', { losses })
    }

    case 'commerce': {
      // The Windmill Token holder takes 1 resource of their choice from the opponent.
      const holder = tokenHolders(state).windmill
      if (holder === null) return { ...state, phase: 'production' }
      const from = opponent(holder)
      const fromResources = availableResources(state.players[from])
      const options = ALL_RESOURCE_TYPES.filter(r => fromResources[r] > 0)
      if (options.length === 0) return { ...state, phase: 'production' }
      return {
        ...state,
        pendingChoices: [{ player: holder, reason: 'commerce', options, takeFrom: from }],
        phase: 'event-resolution',
      }
    }

    case 'tournament': {
      // Strictly higher total Tournament Points chooses 1 free resource. A tie is a no-op.
      const host = computePlayerStats(state.players.host).tournamentPoints
      const guest = computePlayerStats(state.players.guest).tournamentPoints
      const winner: PlayerId | null = host > guest ? 'host' : guest > host ? 'guest' : null
      if (winner === null) return { ...state, phase: 'production' }
      return {
        ...state,
        pendingChoices: [{ player: winner, reason: 'tournament', options: ALL_RESOURCE_TYPES, takeFrom: null }],
        phase: 'event-resolution',
      }
    }

    case 'yearOfPlenty': {
      // Each player gains 1 resource of their choice (active player picks first).
      return {
        ...state,
        pendingChoices: [
          { player: active, reason: 'yearOfPlenty', options: ALL_RESOURCE_TYPES, takeFrom: null },
          { player: opponent(active), reason: 'yearOfPlenty', options: ALL_RESOURCE_TYPES, takeFrom: null },
        ],
        phase: 'event-resolution',
      }
    }

    case 'event': {
      // Reveal the top Event Card, put it under the deck, then resolve it for both players.
      const deck = state.decks.event
      if (deck.length === 0) return { ...state, phase: 'production' }
      const eventCardId = deck[deck.length - 1]
      let s: GameState = logEvent(
        { ...state, decks: { ...state.decks, event: [eventCardId, ...deck.slice(0, -1)] } },
        active, 'event-card', { cardId: eventCardId },
      )
      const effect = getCard(eventCardId).customEffect
      if (effect) s = effect(s, active, {}) ?? s
      return { ...s, phase: s.pendingChoices.length > 0 ? 'event-resolution' : 'production' }
    }
  }
}

/** Roll both dice. RNG is injectable so tests can pin the outcome. */
export function rollDice(rng: () => number = Math.random): DiceRoll {
  // The Event Card face ('event') occupies two of the six faces.
  const eventSymbols: EventSymbol[] = ['brigand', 'commerce', 'tournament', 'yearOfPlenty', 'event', 'event']
  const eventSymbol = eventSymbols[Math.floor(rng() * eventSymbols.length)]
  const productionNumber = (Math.floor(rng() * 6) + 1) as ProductionNumber
  return { eventSymbol, productionNumber }
}

/** Deterministic resolution of a known roll: event first, then production. An Alchemist
 *  played before the roll overrides the Production Die. */
export function applyRoll(state: GameState, roll: DiceRoll): GameState {
  if (state.phase !== 'roll') return state
  const finalRoll: DiceRoll = state.alchemistNumber ? { ...roll, productionNumber: state.alchemistNumber } : roll
  const afterEvent = resolveEventSymbol(
    { ...state, lastRoll: finalRoll, alchemistNumber: null, phase: 'event-resolution' },
    finalRoll.eventSymbol,
  )
  return afterEvent.phase === 'production' ? runProduction(afterEvent, finalRoll.productionNumber) : afterEvent
}

function runProduction(state: GameState, roll: ProductionNumber): GameState {
  const players = { host: produceForPlayer(state.players.host, roll), guest: produceForPlayer(state.players.guest, roll) }
  const gains = {
    host: resourceGain(availableResources(state.players.host), availableResources(players.host)),
    guest: resourceGain(availableResources(state.players.guest), availableResources(players.guest)),
  }
  return logEvent({ ...state, players, phase: 'action' }, state.activePlayer, 'production', { roll, gains })
}

/** Once all pending resource choices are resolved, run the paused production step and enter
 *  the action phase. While choices remain, stay paused in 'event-resolution'. */
function resumeAfterChoices(state: GameState): GameState {
  if (state.pendingChoices.length > 0) return state
  if (state.phase !== 'event-resolution') return state
  const prod = state.lastRoll?.productionNumber
  return prod == null ? { ...state, phase: 'action' } : runProduction(state, prod)
}

/** Submit the resource pick for the head pending choice. Only the owner may answer it. */
function applyChooseResource(state: GameState, actingPlayer: PlayerId, resource: ResourceType): GameState {
  const choice = state.pendingChoices[0]
  if (!choice || choice.player !== actingPlayer || !choice.options.includes(resource)) return state

  // Commerce: take 1 from the opponent (overflow past the region cap is lost — the steal
  // still removes it from the opponent). Otherwise gain 1 from the bank.
  let players = state.players
  if (choice.takeFrom) {
    players = { ...players, [choice.takeFrom]: spendFromRegions(players[choice.takeFrom], { [resource]: 1 }) }
  }
  players = { ...players, [choice.player]: addToRegions(players[choice.player], { [resource]: 1 }) }

  return resumeAfterChoices({ ...state, players, pendingChoices: state.pendingChoices.slice(1) })
}

// ─── Building ─────────────────────────────────────────────────────────────────

function applyBuildRoad(state: GameState, actingPlayer: PlayerId, side: 'left' | 'right'): GameState {
  if (state.phase !== 'action' || state.supply.road <= 0) return state
  const player = state.players[actingPlayer]
  const cost = getCard('road').cost!
  if (!canAfford(availableResources(player), cost)) return state

  // A road goes directly beside a Settlement/City, never next to another road or an empty site.
  const end = side === 'right' ? player.principality[player.principality.length - 1] : player.principality[0]
  if (!end || !isSettlementLike(end)) return state

  const added: CentralSlot[] = [
    { kind: 'road', cardId: 'road', regionIndices: [], expansionSlots: [] },
    { kind: 'empty-settlement', cardId: null, regionIndices: [], expansionSlots: [] },
  ]
  const principality = side === 'right' ? [...player.principality, ...added] : [...added.reverse(), ...player.principality]

  return {
    ...withPlayer(state, actingPlayer, {
      ...spendFromRegions(player, cost), principality, playedCards: [...player.playedCards, 'road'],
    }),
    supply: { ...state.supply, road: state.supply.road - 1 },
  }
}

function applyBuildSettlement(
  state: GameState, actingPlayer: PlayerId, slotIndex: number, scoutRegionIds?: [string, string],
): GameState {
  if (state.phase !== 'action' || state.supply.settlement <= 0) return state
  const player = state.players[actingPlayer]
  const cost = getCard('settlement').cost!
  if (!canAfford(availableResources(player), cost)) return state

  const slot = player.principality[slotIndex]
  if (!slot || slot.kind !== 'empty-settlement') return state
  const atRight = slotIndex === player.principality.length - 1
  const neighbour = player.principality[atRight ? slotIndex - 2 : slotIndex + 2]
  if (!neighbour || !isSettlementLike(neighbour)) return state

  // The 2 new Regions: chosen with a Scout (then reshuffle the stack), else the top 2 cards.
  let top: string, bottom: string, regionStack: string[], hand = player.hand, discardPile = state.discardPile
  if (scoutRegionIds) {
    if (!player.hand.includes(SCOUT.id)) return state
    const rest = removeAll(state.regionStack, scoutRegionIds)
    if (!rest || scoutRegionIds[0] === scoutRegionIds[1]) return state
    ;[top, bottom] = scoutRegionIds
    regionStack = shuffle(rest)
    hand = removeFirst(player.hand, SCOUT.id)
    discardPile = [...discardPile, SCOUT.id]
  } else {
    if (state.regionStack.length < 2) return state
    top = state.regionStack[state.regionStack.length - 1]
    bottom = state.regionStack[state.regionStack.length - 2]
    regionStack = state.regionStack.slice(0, -2)
  }

  const spent = spendFromRegions(player, cost)
  const n = spent.regions.length
  const regions = [...spent.regions, { regionId: top, storedResources: 0 }, { regionId: bottom, storedResources: 0 }]
  // Share the neighbour's facing corners; the new Regions go on the outer side.
  const [nTL, nBL, nTR, nBR] = neighbour.regionIndices
  const regionIndices = atRight ? [nTR, nBR, n, n + 1] : [n, n + 1, nTL, nBL]

  const principality = player.principality.map((s, i) =>
    i === slotIndex ? { kind: 'settlement' as const, cardId: 'settlement', regionIndices, expansionSlots: [null, null] } : s)

  return {
    ...withPlayer(state, actingPlayer, {
      ...spent, hand, regions, principality, playedCards: [...player.playedCards, 'settlement'],
    }),
    regionStack,
    discardPile,
    supply: { ...state.supply, settlement: state.supply.settlement - 1 },
  }
}

function applyBuildCity(state: GameState, actingPlayer: PlayerId, slotIndex: number): GameState {
  if (state.phase !== 'action' || state.supply.city <= 0) return state
  const player = state.players[actingPlayer]
  const cost = getCard('city').cost!
  if (!canAfford(availableResources(player), cost)) return state

  const slot = player.principality[slotIndex]
  if (!slot || slot.kind !== 'settlement') return state

  // 2 sites above, 2 below: the Settlement's above/below cards keep their side.
  const [above, below] = slot.expansionSlots
  const principality = player.principality.map((s, i) =>
    i === slotIndex ? { ...s, kind: 'city' as const, cardId: 'city', expansionSlots: [above, null, below, null] } : s)

  // The Settlement under the City no longer counts: swap one 'settlement' entry for 'city'.
  const playedCards = [...player.playedCards]
  playedCards[playedCards.indexOf('settlement')] = 'city'

  return {
    ...withPlayer(state, actingPlayer, { ...spendFromRegions(player, cost), principality, playedCards }),
    supply: { ...state.supply, city: state.supply.city - 1 },
  }
}

function applyPlaceExpansion(
  state: GameState, actingPlayer: PlayerId, cardId: string, slotIndex: number, expansionSlotIndex: number,
): GameState {
  if (state.phase !== 'action') return state
  const player = state.players[actingPlayer]
  const card = CARD_REGISTRY[cardId]
  if (!card || card.category !== 'expansion') return state
  if (!player.hand.includes(cardId)) return state
  if (!canAfford(availableResources(player), card.cost ?? {})) return state

  const slot = player.principality[slotIndex]
  if (!slot || !isSettlementLike(slot)) return state
  if (card.expansionColor === 'red' && slot.kind !== 'city') return state
  if (slot.expansionSlots[expansionSlotIndex] !== null) return state

  const principality = player.principality.map((s, i) => {
    if (i !== slotIndex) return s
    const slots = [...s.expansionSlots]
    slots[expansionSlotIndex] = cardId
    return { ...s, expansionSlots: slots }
  })

  return withPlayer(state, actingPlayer, {
    ...spendFromRegions(player, card.cost ?? {}),
    hand: removeFirst(player.hand, cardId),
    principality,
    playedCards: [...player.playedCards, cardId],
  })
}

function applyDemolish(state: GameState, actingPlayer: PlayerId, slotIndex: number, expansionSlotIndex: number): GameState {
  if (state.phase !== 'action') return state
  const player = state.players[actingPlayer]
  const slot = player.principality[slotIndex]
  const cardId = slot?.expansionSlots[expansionSlotIndex]
  if (!slot || !cardId) return state

  const principality = player.principality.map((s, i) => {
    if (i !== slotIndex) return s
    const slots = [...s.expansionSlots]
    slots[expansionSlotIndex] = null
    return { ...s, expansionSlots: slots }
  })

  return {
    ...withPlayer(state, actingPlayer, { ...player, principality, playedCards: removeFirst(player.playedCards, cardId) }),
    discardPile: [...state.discardPile, cardId],
  }
}

// ─── Action Cards ─────────────────────────────────────────────────────────────

function applyPlayActionCard(state: GameState, actingPlayer: PlayerId, cardId: string, params: ActionCardParams): GameState {
  const player = state.players[actingPlayer]
  const card = CARD_REGISTRY[cardId]
  if (!card || card.category !== 'action' || card.notImplemented || !card.customEffect) return state
  if (!player.hand.includes(cardId)) return state
  if (!actionCardsUnlocked(state)) return state
  // Alchemist is played before the roll; everything else after the dice are resolved.
  const beforeRoll = cardId === 'alchemist'
  if (beforeRoll ? state.phase !== 'roll' || state.alchemistNumber !== null : state.phase !== 'action') return state

  const played: GameState = {
    ...withPlayer(state, actingPlayer, { ...player, hand: removeFirst(player.hand, cardId) }),
    discardPile: [...state.discardPile, cardId],
  }
  return card.customEffect(played, actingPlayer, params) ?? state
}

// ─── Trading ──────────────────────────────────────────────────────────────────

function applyTradeWithBank(state: GameState, actingPlayer: PlayerId, give: ResourceType, receive: ResourceType): GameState {
  if (state.phase !== 'action' || give === receive) return state
  const player = state.players[actingPlayer]
  const rate = getTradeRate(player, give)
  if (availableResources(player)[give] < rate) return state
  return withPlayer(state, actingPlayer, addToRegions(spendFromRegions(player, { [give]: rate }), { [receive]: 1 }))
}

/** Active player offers a resource trade to the opponent. Only one offer at a time. */
function applyProposeTrade(state: GameState, actingPlayer: PlayerId, give: Partial<Resources>, receive: Partial<Resources>): GameState {
  if (state.phase !== 'action' || state.pendingTrade) return state
  if (!canAfford(availableResources(state.players[actingPlayer]), give)) return state
  if (totalOf(give) === 0 || totalOf(receive) === 0) return state
  return { ...state, pendingTrade: { from: actingPlayer, give, receive } }
}

/** The opponent (or proposer) responds to the pending offer. */
function applyRespondTrade(state: GameState, actingPlayer: PlayerId, accept: boolean): GameState {
  const offer = state.pendingTrade
  if (!offer) return state
  if (!accept) return { ...state, pendingTrade: null }

  const responder = opponent(offer.from)
  if (actingPlayer !== responder) return state
  if (!canAfford(availableResources(state.players[offer.from]), offer.give)) return { ...state, pendingTrade: null }
  if (!canAfford(availableResources(state.players[responder]), offer.receive)) return { ...state, pendingTrade: null }

  const proposer = addToRegions(spendFromRegions(state.players[offer.from], offer.give), offer.receive)
  const accepter = addToRegions(spendFromRegions(state.players[responder], offer.receive), offer.give)
  return { ...state, players: { ...state.players, [offer.from]: proposer, [responder]: accepter }, pendingTrade: null }
}

function totalOf(r: Partial<Resources>): number {
  return Object.values(r).reduce((sum, n) => sum + (n ?? 0), 0)
}

// ─── Draw Phase (GAME_LOGIC.md §8) ────────────────────────────────────────────

function stacksEmpty(state: GameState): boolean {
  return DRAW_STACK_IDS.every(d => state.decks[d].length === 0)
}

function passTurn(state: GameState): GameState {
  return { ...state, phase: 'roll', activePlayer: opponent(state.activePlayer), turn: state.turn + 1, search: null, pendingTrade: null }
}

/** After a draw: the turn ends once the hand is full (or nothing is left to draw). */
function afterDraw(state: GameState): GameState {
  const player = state.players[state.activePlayer]
  return player.hand.length >= computePlayerStats(player).handLimit || stacksEmpty(state) ? passTurn(state) : state
}

/** Pay for a Search with exactly `searchCost` resources of any mix. */
function payForSearch(player: PlayerState, payWith: ResourceType[] | undefined): PlayerState | null {
  if (!payWith || payWith.length !== searchCost(player)) return null
  if (!payWith.every(r => ALL_RESOURCE_TYPES.includes(r))) return null
  const cost = countResources(payWith)
  if (!canAfford(availableResources(player), cost)) return null
  return spendFromRegions(player, cost)
}

function applyEndActionPhase(state: GameState, actingPlayer: PlayerId): GameState {
  if (state.phase !== 'action' || state.pendingChoices.length > 0) return state
  const player = state.players[actingPlayer]
  const limit = computePlayerStats(player).handLimit
  const s = { ...state, pendingTrade: null }
  if (player.hand.length === limit) return { ...s, phase: 'exchange' }
  if (player.hand.length < limit && stacksEmpty(s)) return passTurn(s)
  return { ...s, phase: 'draw' }
}

/** Over the limit: put exactly the excess cards under stacks of the player's choice. */
function applyDiscardToLimit(state: GameState, actingPlayer: PlayerId, discards: { cardId: string; toDeck: DrawStackId }[]): GameState {
  if (state.phase !== 'draw') return state
  const player = state.players[actingPlayer]
  const excess = player.hand.length - computePlayerStats(player).handLimit
  if (excess <= 0 || discards.length !== excess) return state
  if (!discards.every(d => isDrawStack(d.toDeck))) return state
  const hand = removeAll(player.hand, discards.map(d => d.cardId))
  if (!hand) return state

  const decks = { ...state.decks }
  for (const { cardId, toDeck } of discards) decks[toDeck] = [cardId, ...decks[toDeck]]
  return { ...withPlayer(state, actingPlayer, { ...player, hand }), decks, phase: 'exchange' }
}

/** Random draw: the top card of any stack. */
function applyDrawCard(state: GameState, actingPlayer: PlayerId, fromDeck: DrawStackId): GameState {
  if (state.phase !== 'draw' || state.search || !isDrawStack(fromDeck)) return state
  const player = state.players[actingPlayer]
  const deck = state.decks[fromDeck]
  if (player.hand.length >= computePlayerStats(player).handLimit || deck.length === 0) return state
  return afterDraw({
    ...withPlayer(state, actingPlayer, { ...player, hand: [...player.hand, deck[deck.length - 1]] }),
    decks: { ...state.decks, [fromDeck]: deck.slice(0, -1) },
  })
}

/** Open a stack: free in setup (starting cards), paid in the draw phase. */
function applySearchStack(state: GameState, actingPlayer: PlayerId, deck: DrawStackId, payWith?: ResourceType[]): GameState {
  if (state.search || !isDrawStack(deck) || state.decks[deck].length === 0) return state

  if (state.phase === 'setup') {
    if (setupChooser(state) !== actingPlayer) return state
    if (Object.values(state.setup.picked).includes(deck)) return state  // must differ from the first pick
    return { ...state, search: { player: actingPlayer, deck, purpose: 'setup' } }
  }

  if (state.phase !== 'draw') return state
  const player = state.players[actingPlayer]
  if (player.hand.length >= computePlayerStats(player).handLimit) return state
  const paid = payForSearch(player, payWith)
  if (!paid) return state
  return { ...withPlayer(state, actingPlayer, paid), search: { player: actingPlayer, deck, purpose: 'draw' } }
}

function applyTakeFromSearch(state: GameState, actingPlayer: PlayerId, cardIds: string[]): GameState {
  const search = state.search
  if (!search || search.player !== actingPlayer) return state

  if (search.purpose === 'setup') {
    const needed = Math.min(3, state.decks[search.deck].length)
    if (cardIds.length !== needed) return state
    return finishSetupPick(state, actingPlayer, search.deck, cardIds) ?? state
  }

  if (cardIds.length !== 1) return state
  const rest = removeAll(state.decks[search.deck], cardIds)
  if (!rest) return state
  const player = state.players[actingPlayer]
  const taken: GameState = {
    ...withPlayer(state, actingPlayer, { ...player, hand: [...player.hand, cardIds[0]] }),
    decks: { ...state.decks, [search.deck]: rest },
    search: null,
  }
  return search.purpose === 'exchange' ? passTurn(taken) : afterDraw(taken)
}

/** Put a card under a stack, then take that stack's top card or Search it. */
function applyExchange(state: GameState, actingPlayer: PlayerId, cardId: string, deck: DrawStackId, payWith?: ResourceType[]): GameState {
  if (state.phase !== 'exchange' || state.search || !isDrawStack(deck)) return state
  const player = state.players[actingPlayer]
  if (!player.hand.includes(cardId)) return state

  const buried = [cardId, ...state.decks[deck]]
  const handWithout = removeFirst(player.hand, cardId)

  if (payWith) {
    const paid = payForSearch(player, payWith)
    if (!paid) return state
    return {
      ...withPlayer(state, actingPlayer, { ...paid, hand: handWithout }),
      decks: { ...state.decks, [deck]: buried },
      search: { player: actingPlayer, deck, purpose: 'exchange' },
    }
  }

  return passTurn({
    ...withPlayer(state, actingPlayer, { ...player, hand: [...handWithout, buried[buried.length - 1]] }),
    decks: { ...state.decks, [deck]: buried.slice(0, -1) },
  })
}

// ─── Main Reducer ─────────────────────────────────────────────────────────────

/** Whether `actingPlayer` may submit `action` at all (finer checks live in each handler). */
function mayAct(state: GameState, actingPlayer: PlayerId, action: GameAction): boolean {
  switch (action.type) {
    case 'SWAP_STARTING_REGIONS': return true
    case 'CHOOSE_RESOURCE': return state.pendingChoices[0]?.player === actingPlayer
    case 'ACCEPT_TRADE':
    case 'DECLINE_TRADE': return true
    case 'TAKE_FROM_SEARCH': return state.search?.player === actingPlayer
    case 'SEARCH_STACK': return state.phase === 'setup' || state.activePlayer === actingPlayer
    default: return state.phase !== 'setup' && state.activePlayer === actingPlayer
  }
}

export function applyAction(state: GameState, actingPlayer: PlayerId, action: GameAction): GameState {
  if (state.winner || !mayAct(state, actingPlayer, action)) return state

  let next: GameState
  switch (action.type) {
    case 'SWAP_STARTING_REGIONS': next = applySwapStartingRegions(state, actingPlayer, action.a, action.b); break
    case 'SEARCH_STACK':       next = applySearchStack(state, actingPlayer, action.deck, action.payWith); break
    case 'TAKE_FROM_SEARCH':   next = applyTakeFromSearch(state, actingPlayer, action.cardIds); break
    case 'ROLL_DICE':          next = applyRoll(state, rollDice()); break
    case 'BUILD_ROAD':         next = applyBuildRoad(state, actingPlayer, action.side); break
    case 'BUILD_SETTLEMENT':   next = applyBuildSettlement(state, actingPlayer, action.slotIndex, action.scoutRegionIds); break
    case 'BUILD_CITY':         next = applyBuildCity(state, actingPlayer, action.slotIndex); break
    case 'PLACE_EXPANSION':    next = applyPlaceExpansion(state, actingPlayer, action.cardId, action.slotIndex, action.expansionSlotIndex); break
    case 'PLAY_ACTION_CARD':   next = applyPlayActionCard(state, actingPlayer, action.cardId, action.params ?? {}); break
    case 'TRADE_WITH_BANK':    next = applyTradeWithBank(state, actingPlayer, action.give, action.receive); break
    case 'CHOOSE_RESOURCE':    next = applyChooseResource(state, actingPlayer, action.resource); break
    case 'PROPOSE_TRADE':      next = applyProposeTrade(state, actingPlayer, action.give, action.receive); break
    case 'ACCEPT_TRADE':       next = applyRespondTrade(state, actingPlayer, true); break
    case 'DECLINE_TRADE':      next = applyRespondTrade(state, actingPlayer, false); break
    case 'DEMOLISH':           next = applyDemolish(state, actingPlayer, action.slotIndex, action.expansionSlotIndex); break
    case 'END_ACTION_PHASE':   next = applyEndActionPhase(state, actingPlayer); break
    case 'DISCARD_TO_LIMIT':   next = applyDiscardToLimit(state, actingPlayer, action.discards); break
    case 'DRAW_CARD':          next = applyDrawCard(state, actingPlayer, action.fromDeck); break
    case 'EXCHANGE':           next = applyExchange(state, actingPlayer, action.cardId, action.deck, action.payWith); break
    case 'SKIP_EXCHANGE':      next = state.phase === 'exchange' && !state.search ? passTurn(state) : state; break
    default:                   next = state
  }

  if (next === state) return state
  return { ...next, eventLog: withActionLogged(state, next, actingPlayer, action), winner: checkVictory(next) }
}

/** Most recent activity-log entries kept in the state (and so sent to both players). */
const EVENT_LOG_LIMIT = 50

/** The log after `action`: its own entry goes before whatever the handler logged (production,
 *  event cards…), so the log reads in the order things happened. */
function withActionLogged(before: GameState, after: GameState, actingPlayer: PlayerId, action: GameAction): GameEvent[] {
  const added = after.eventLog.slice(before.eventLog.length)
  const payload = actionLogPayload(before, after, actingPlayer, action)
  const own = payload ? [makeEvent(actingPlayer, action.type, payload)] : []
  return [...before.eventLog, ...own, ...added].slice(-EVENT_LOG_LIMIT)
}

/** Public details of a successful action for the activity log, or null to leave it out.
 *  Cards drawn, searched, put back or exchanged stay secret: only stacks and counts. */
function actionLogPayload(before: GameState, after: GameState, actingPlayer: PlayerId, action: GameAction): Record<string, unknown> | null {
  switch (action.type) {
    case 'SWAP_STARTING_REGIONS': return null
    case 'ROLL_DICE': return { ...after.lastRoll }
    case 'SEARCH_STACK': return { deck: action.deck, purpose: after.search?.purpose ?? null }
    case 'TAKE_FROM_SEARCH': return { deck: before.search?.deck ?? null, count: action.cardIds.length }
    case 'BUILD_SETTLEMENT': return { scout: !!action.scoutRegionIds }
    case 'PLACE_EXPANSION': return { cardId: action.cardId }
    case 'PLAY_ACTION_CARD': return { cardId: action.cardId }
    case 'TRADE_WITH_BANK':
      return { give: action.give, receive: action.receive, rate: getTradeRate(before.players[actingPlayer], action.give) }
    case 'CHOOSE_RESOURCE': return { resource: action.resource, reason: before.pendingChoices[0]?.reason ?? null }
    case 'PROPOSE_TRADE': return { give: action.give, receive: action.receive }
    case 'ACCEPT_TRADE': return { ...before.pendingTrade, completed: after.players !== before.players }
    case 'DECLINE_TRADE': return { byProposer: before.pendingTrade?.from === actingPlayer }
    case 'DEMOLISH':
      return { cardId: before.players[actingPlayer].principality[action.slotIndex]?.expansionSlots[action.expansionSlotIndex] ?? null }
    case 'DISCARD_TO_LIMIT': return { count: action.discards.length }
    case 'DRAW_CARD': return { deck: action.fromDeck }
    case 'EXCHANGE': return { deck: action.deck, searched: !!action.payWith }
    default: return {}
  }
}

// ─── Projection ───────────────────────────────────────────────────────────────

/** What `viewer` may see: the opponent's hand and every stack become counts, the Region stack
 *  becomes its sorted composition, and an open search is revealed to the searcher only. */
export function projectStateFor(state: GameState, viewer: PlayerId): ProjectedState {
  const other = opponent(viewer)
  const { decks, regionStack, ...rest } = state
  const deckSizes = Object.fromEntries(Object.entries(decks).map(([id, cards]) => [id, cards.length])) as Record<DeckId, number>
  return {
    ...rest,
    players: {
      [viewer]: state.players[viewer],
      [other]: { ...state.players[other], hand: state.players[other].hand.length },
    } as ProjectedState['players'],
    deckSizes,
    regionStack: [...regionStack].sort(),
    searchContents: state.search?.player === viewer ? [...decks[state.search.deck]] : null,
  }
}
