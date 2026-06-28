import {
  GameState, PlayerState, PlayerId, ResourceType, Resources, EMPTY_RESOURCES,
  GameAction, ProjectedState, DiceRoll, EventSymbol, ProductionNumber,
  DeckId, CentralSlot, RegionState, RegionExpansionPosition, CardDefinition,
} from './types'
import {
  getCard, getRegion, CARD_REGISTRY,
  DEFAULT_GREEN_DECK, DEFAULT_RED_DECK, DEFAULT_BROWN_DECK,
  DEFAULT_YELLOW_DECK, DEFAULT_EVENT_DECK,
  REGION_DEFINITIONS,
} from './cards'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function opponent(player: PlayerId): PlayerId {
  return player === 'host' ? 'guest' : 'host'
}

/** Return a copy of `hand` with the first occurrence of `cardId` removed. */
function removeFirst(hand: string[], cardId: string): string[] {
  const idx = hand.indexOf(cardId)
  if (idx === -1) return [...hand]
  const copy = [...hand]
  copy.splice(idx, 1)
  return copy
}

function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (Object.keys(cost) as ResourceType[]).every(r => resources[r] >= (cost[r] ?? 0))
}

/** All six resource types, derived from the canonical empty-resources shape. */
const ALL_RESOURCE_TYPES = Object.keys(EMPTY_RESOURCES) as ResourceType[]

// ─── Region-based Resources ────────────────────────────────────────────────────
// Resources are stored directly on a player's Regions (0–3 pips each). These
// helpers treat the Regions as the single source of truth for spendable resources.

/** A player's spendable resources, summed from region storage by resource type. */
export function availableResources(player: PlayerState): Resources {
  const r: Resources = { ...EMPTY_RESOURCES }
  for (const region of player.regions) {
    r[getRegion(region.regionId).resourceType] += region.storedResources
  }
  return r
}

/** Total stored resources across all regions (used for the Bandit > 7 check). */
function totalAvailable(player: PlayerState): number {
  return player.regions.reduce((sum, region) => sum + region.storedResources, 0)
}

/** Spend a cost from a player's regions, drawing greedily from regions of each
 *  type. Assumes affordability was already checked via availableResources. */
function spendFromRegions(player: PlayerState, cost: Partial<Resources>): PlayerState {
  const regions = player.regions.map(r => ({ ...r }))
  for (const [res, amount] of Object.entries(cost) as [ResourceType, number][]) {
    let remaining = amount ?? 0
    for (const region of regions) {
      if (remaining <= 0) break
      if (getRegion(region.regionId).resourceType !== res) continue
      const take = Math.min(region.storedResources, remaining)
      region.storedResources -= take
      remaining -= take
    }
  }
  return { ...player, regions }
}

/** Add resources to a player's regions of the matching type, capped at 3 each
 *  (overflow is lost). Distributes across multiple matching regions. */
function addToRegions(player: PlayerState, gain: Partial<Resources>): PlayerState {
  const regions = player.regions.map(r => ({ ...r }))
  for (const [res, amount] of Object.entries(gain) as [ResourceType, number][]) {
    let remaining = amount ?? 0
    for (const region of regions) {
      if (remaining <= 0) break
      if (getRegion(region.regionId).resourceType !== res) continue
      const space = 3 - region.storedResources
      const add = Math.min(space, remaining)
      region.storedResources += add
      remaining -= add
    }
  }
  return { ...player, regions }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 9)
}

// ─── Stats / Derived Values ───────────────────────────────────────────────────

export function computePlayerStats(player: PlayerState): {
  victoryPoints: number
  strengthPoints: number
  commercePoints: number
  progressPoints: number
  tournamentPoints: number
  handLimit: number
} {
  let vp = 0
  let strength = 0
  let commerce = 0
  let progress = 0
  let tournament = 0

  for (const cardId of player.playedCards) {
    const def = getCard(cardId)
    vp += def.directVP ?? 0
    for (const effect of def.effects) {
      if (effect.type === 'GRANT_SYMBOL') {
        if (effect.symbol === 'strength') strength += effect.amount
        if (effect.symbol === 'commerce') commerce += effect.amount
        if (effect.symbol === 'progress') progress += effect.amount
        if (effect.symbol === 'tournament') tournament += effect.amount
      }
      if (effect.type === 'GRANT_VP') vp += effect.amount
    }
  }

  return {
    victoryPoints: vp,
    strengthPoints: strength,
    commercePoints: commerce,
    progressPoints: progress,
    tournamentPoints: tournament,
    handLimit: 3 + progress,
  }
}

function computeAdvantages(
  state: GameState
): { hostHero: boolean; hostTrade: boolean } {
  const hostStats = computePlayerStats(state.players.host)
  const guestStats = computePlayerStats(state.players.guest)

  const hostHero =
    hostStats.strengthPoints >= 3 &&
    hostStats.strengthPoints > guestStats.strengthPoints

  const hostTrade =
    hostStats.commercePoints >= 3 &&
    hostStats.commercePoints > guestStats.commercePoints

  return { hostHero, hostTrade }
}

export function computeVP(state: GameState, playerId: PlayerId): number {
  const stats = computePlayerStats(state.players[playerId])
  const { hostHero, hostTrade } = computeAdvantages(state)
  const isHost = playerId === 'host'

  const heroVP = (isHost ? hostHero : !hostHero && computePlayerStats(state.players.guest).strengthPoints >= 3 &&
    computePlayerStats(state.players.guest).strengthPoints > computePlayerStats(state.players.host).strengthPoints) ? 1 : 0

  const tradeVP = (isHost ? hostTrade : !hostTrade && computePlayerStats(state.players.guest).commercePoints >= 3 &&
    computePlayerStats(state.players.guest).commercePoints > computePlayerStats(state.players.host).commercePoints) ? 1 : 0

  return stats.victoryPoints + heroVP + tradeVP
}

function checkVictory(state: GameState): PlayerId | null {
  for (const pid of ['host', 'guest'] as PlayerId[]) {
    if (computeVP(state, pid) >= state.config.vpTarget) return pid
  }
  return null
}

// ─── Trade Rate ───────────────────────────────────────────────────────────────

export function getTradeRate(player: PlayerState, resource: ResourceType): 2 | 3 {
  for (const cardId of player.playedCards) {
    const def = getCard(cardId)
    for (const effect of def.effects) {
      if (effect.type === 'IMPROVED_TRADE' && effect.resource === resource) return 2
    }
  }
  return 3
}

// ─── Region Production ────────────────────────────────────────────────────────

/** A Brown Expansion above or below a Region adds +1 to that Region's yield. */
function regionYield(region: RegionState): number {
  let bonus = 0
  if (region.expansionAbove && getCard(region.expansionAbove).expansionColor === 'brown') bonus++
  if (region.expansionBelow && getCard(region.expansionBelow).expansionColor === 'brown') bonus++
  return 1 + bonus
}

function produceForPlayer(player: PlayerState, roll: ProductionNumber): PlayerState {
  const newRegions = player.regions.map(region => {
    const def = getRegion(region.regionId)
    if (def.productionNumber !== roll) return region
    if (region.storedResources >= 3) return region  // overflow — resource lost
    // Capacity is 3; any yield beyond that overflows and is lost.
    return { ...region, storedResources: Math.min(3, region.storedResources + regionYield(region)) }
  })
  return { ...player, regions: newRegions }
}

// ─── Game Initialization ──────────────────────────────────────────────────────

interface InitialBoard {
  principality: CentralSlot[]
  regions: { regionId: string; storedResources: number; expansionAbove: null; expansionBelow: null }[]
}

function makeInitialPrincipalityAndRegions(): InitialBoard {
  // One region of each resource type, randomly chosen from available variants
  const resourceTypes: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']
  const chosenRegions = resourceTypes.map(rt => {
    const options = REGION_DEFINITIONS.filter(r => r.resourceType === rt)
    return options[Math.floor(Math.random() * options.length)]
  })

  // Shuffle and split 3-3 between the two starting settlements
  const shuffled = shuffle(chosenRegions)
  const regions = shuffled.map(rd => ({
    regionId: rd.id,
    storedResources: 1,  // each player starts with 1 of every resource
    expansionAbove: null,
    expansionBelow: null,
  }))

  const principality: CentralSlot[] = [
    { kind: 'settlement', cardId: 'settlement', regionIndices: [0, 1, 2], expansionSlots: [null, null] },
    { kind: 'road',       cardId: 'road',       regionIndices: [],         expansionSlots: [] },
    { kind: 'settlement', cardId: 'settlement', regionIndices: [3, 4, 5], expansionSlots: [null, null] },
  ]

  return { principality, regions }
}

function makeInitialPlayer(id: PlayerId): PlayerState {
  const { principality, regions } = makeInitialPrincipalityAndRegions()
  return {
    id,
    hand: [],
    principality,
    regions,
    playedCards: ['settlement', 'road', 'settlement'],
    drawnThisTurn: [],
  }
}

export function createInitialState(config: { vpTarget: number; language: 'en' | 'de' }): GameState {
  const greenDeck = shuffle(DEFAULT_GREEN_DECK)
  const redDeck = shuffle(DEFAULT_RED_DECK)
  const brownDeck = shuffle(DEFAULT_BROWN_DECK)
  const yellowDeck = shuffle(DEFAULT_YELLOW_DECK)
  const eventDeck = shuffle(DEFAULT_EVENT_DECK)

  const hostPlayer = makeInitialPlayer('host')
  const guestPlayer = makeInitialPlayer('guest')

  // Deal starting hand (3 cards each from the appropriate decks)
  const dealCards = (player: PlayerState, deck: string[]): { player: PlayerState; deck: string[] } => {
    const hand = deck.slice(-3)
    return { player: { ...player, hand }, deck: deck.slice(0, -3) }
  }

  const { player: hostWithHand, deck: greenAfterHost } = dealCards(hostPlayer, greenDeck)
  const { player: guestWithHand, deck: greenAfterGuest } = dealCards(guestPlayer, greenAfterHost)

  return {
    sessionId: nanoid(),
    config: { vpTarget: config.vpTarget, language: config.language },
    players: { host: hostWithHand, guest: guestWithHand },
    activePlayer: 'host',
    phase: 'roll',
    lastRoll: null,
    winner: null,
    decks: {
      green: greenAfterGuest,
      red: redDeck,
      brown: brownDeck,
      yellow: yellowDeck,
      event: eventDeck,
    },
    discardPile: [],
    pendingTrade: null,
    pendingChoices: [],
    eventLog: [],
  }
}

// ─── Event Resolution ─────────────────────────────────────────────────────────

function resolveEventSymbol(state: GameState, symbol: EventSymbol): GameState {
  const active = state.activePlayer

  switch (symbol) {
    case 'bandit': {
      // Any player with strictly more than 7 resources loses all Gold and Wool
      const purgeIfExcess = (p: PlayerState): PlayerState => {
        if (totalAvailable(p) <= 7) return p
        const regions = p.regions.map(region => {
          const type = getRegion(region.regionId).resourceType
          return type === 'gold' || type === 'wool' ? { ...region, storedResources: 0 } : region
        })
        return { ...p, regions }
      }
      return {
        ...state,
        players: {
          host: purgeIfExcess(state.players.host),
          guest: purgeIfExcess(state.players.guest),
        },
        phase: 'action',  // bandit skips production
      }
    }

    case 'trade': {
      // The Trade-Token holder takes 1 resource of their choice from the opponent.
      const hostStats = computePlayerStats(state.players.host)
      const guestStats = computePlayerStats(state.players.guest)
      const hostHasTrade = hostStats.commercePoints >= 3 && hostStats.commercePoints > guestStats.commercePoints
      const guestHasTrade = guestStats.commercePoints >= 3 && guestStats.commercePoints > hostStats.commercePoints
      const holder: PlayerId | null = hostHasTrade ? 'host' : guestHasTrade ? 'guest' : null

      // No holder, or the opponent has nothing to take: resolve as a no-op.
      if (holder === null) return { ...state, phase: 'production' }
      const from = opponent(holder)
      const fromResources = availableResources(state.players[from])
      const options = ALL_RESOURCE_TYPES.filter(r => fromResources[r] > 0)
      if (options.length === 0) return { ...state, phase: 'production' }

      // Pause and let the holder pick which resource to take.
      return {
        ...state,
        pendingChoices: [{ player: holder, reason: 'trade', options, takeFrom: from }],
        phase: 'event-resolution',
      }
    }

    case 'tournament': {
      // The player with the strictly higher SUM of their Knights' Tournament Points
      // chooses 1 free resource from the bank. A tie (including 0–0) is a no-op.
      const hostStats = computePlayerStats(state.players.host)
      const guestStats = computePlayerStats(state.players.guest)
      const winner: PlayerId | null =
        hostStats.tournamentPoints > guestStats.tournamentPoints ? 'host'
        : guestStats.tournamentPoints > hostStats.tournamentPoints ? 'guest'
        : null

      if (winner === null) return { ...state, phase: 'production' }

      // Pause and let the winner pick their free resource (overflow past the cap is lost).
      return {
        ...state,
        pendingChoices: [{ player: winner, reason: 'tournament', options: ALL_RESOURCE_TYPES, takeFrom: null }],
        phase: 'event-resolution',
      }
    }

    case 'harvest': {
      // Each player gains 1 free resource of their choice (active player picks first).
      const other = opponent(active)
      return {
        ...state,
        pendingChoices: [
          { player: active, reason: 'harvest', options: ALL_RESOURCE_TYPES, takeFrom: null },
          { player: other, reason: 'harvest', options: ALL_RESOURCE_TYPES, takeFrom: null },
        ],
        phase: 'event-resolution',
      }
    }

    case 'event': {
      // Draw and resolve top event card
      if (state.decks.event.length === 0) return { ...state, phase: 'production' }
      const eventCardId = state.decks.event[state.decks.event.length - 1]
      const remainingEventDeck = state.decks.event.slice(0, -1)
      const eventCard = getCard(eventCardId)

      let s: GameState = {
        ...state,
        decks: { ...state.decks, event: remainingEventDeck },
        discardPile: [...state.discardPile, eventCardId],
        phase: 'production',
      }

      // Apply declarative effects to active player
      for (const effect of eventCard.effects) {
        if (effect.type === 'GRANT_RESOURCE') {
          s = {
            ...s,
            players: {
              ...s.players,
              [active]: addToRegions(s.players[active], { [effect.resource]: effect.amount }),
            },
          }
        }
      }

      if (eventCard.customEffect) {
        s = eventCard.customEffect(s, active)
        s = { ...s, phase: 'production' }
      }

      return s
    }

    default:
      return { ...state, phase: 'production' }
  }
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

/** Roll both dice. RNG is injectable so tests can pin the outcome. */
export function rollDice(rng: () => number = Math.random): DiceRoll {
  // 'event' occupies two of the six faces (twice the chance), as on the real event die.
  const eventSymbols: EventSymbol[] = ['bandit', 'trade', 'tournament', 'harvest', 'event', 'event']
  const eventSymbol = eventSymbols[Math.floor(rng() * eventSymbols.length)]
  const productionNumber = (Math.floor(rng() * 6) + 1) as ProductionNumber
  return { eventSymbol, productionNumber }
}

/** Deterministic resolution of a known roll: event first, then production. */
export function applyRoll(state: GameState, roll: DiceRoll): GameState {
  if (state.phase !== 'roll') return state
  const afterEvent = resolveEventSymbol({ ...state, lastRoll: roll, phase: 'event-resolution' }, roll.eventSymbol)

  // After event resolution, if phase is 'production', run production (Bandit skips it).
  if (afterEvent.phase === 'production') {
    return runProduction(afterEvent, roll.productionNumber)
  }
  return afterEvent
}

function applyRollDice(state: GameState): GameState {
  return applyRoll(state, rollDice())
}

function runProduction(state: GameState, roll: ProductionNumber): GameState {
  return {
    ...state,
    players: {
      host: produceForPlayer(state.players.host, roll),
      guest: produceForPlayer(state.players.guest, roll),
    },
    phase: 'action',
  }
}

/** Once all pending resource choices are resolved, run the paused production step
 *  (using the production number stored on the triggering roll) and enter the action
 *  phase. While choices remain, stay paused in 'event-resolution'. */
function resumeAfterChoices(state: GameState): GameState {
  if (state.pendingChoices.length > 0) return state
  // Only the event-resolution flow has a paused production step to resume. Choices
  // raised during the action phase (e.g. Ambush) keep phase 'action' and must not
  // trigger production a second time.
  if (state.phase !== 'event-resolution') return state
  const prod = state.lastRoll?.productionNumber
  return prod == null ? { ...state, phase: 'action' } : runProduction(state, prod)
}

/** Submit the resource pick for the head pending choice. Only the choice owner may
 *  answer it, and only with one of its offered options. */
function applyChooseResource(state: GameState, actingPlayer: PlayerId, resource: ResourceType): GameState {
  const choice = state.pendingChoices[0]
  if (!choice) return state
  if (choice.player !== actingPlayer) return state
  if (!choice.options.includes(resource)) return state

  // Trade: take 1 from the opponent and give it to the chooser (overflow past the
  // region cap is lost — the steal still removes it from the opponent). Harvest:
  // gain 1 from the bank.
  let players = state.players
  if (choice.takeFrom) {
    players = {
      ...players,
      [choice.takeFrom]: spendFromRegions(players[choice.takeFrom], { [resource]: 1 }),
      [choice.player]: addToRegions(players[choice.player], { [resource]: 1 }),
    }
  } else {
    players = {
      ...players,
      [choice.player]: addToRegions(players[choice.player], { [resource]: 1 }),
    }
  }

  return resumeAfterChoices({
    ...state,
    players,
    pendingChoices: state.pendingChoices.slice(1),
  })
}

function applyBuildRoad(state: GameState, actingPlayer: PlayerId, slotIndex: number): GameState {
  const player = state.players[actingPlayer]
  const cost = { wood: 1, brick: 2 }
  if (!canAfford(availableResources(player), cost)) return state

  const principality = [...player.principality]

  // Extend principality if building at the edge
  if (slotIndex === principality.length) {
    principality.push({ kind: 'road', cardId: 'road', regionIndices: [], expansionSlots: [] })
    principality.push({ kind: 'empty-settlement', cardId: null, regionIndices: [], expansionSlots: [] })
  } else {
    if (principality[slotIndex]?.kind !== 'empty-road') return state
    principality[slotIndex] = { ...principality[slotIndex], kind: 'road', cardId: 'road' }
  }

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...spendFromRegions(player, cost),
        principality,
        playedCards: [...player.playedCards, 'road'],
      },
    },
  }
}

function applyBuildSettlement(state: GameState, actingPlayer: PlayerId, slotIndex: number): GameState {
  const player = state.players[actingPlayer]
  const cost = { wood: 1, brick: 1, grain: 1, wool: 1 }
  if (!canAfford(availableResources(player), cost)) return state

  const slot = player.principality[slotIndex]
  if (!slot || slot.kind !== 'empty-settlement') return state

  // Assign 2 new regions from a shuffled pool
  const usedRegionIds = new Set(player.regions.map(r => r.regionId))
  const available = REGION_DEFINITIONS.filter(r => !usedRegionIds.has(r.id))
  if (available.length < 2) return state
  const [r1, r2] = shuffle(available)

  // Spend the cost from existing regions first, then append the 2 new regions.
  const spent = spendFromRegions(player, cost)
  const newRegions = [
    ...spent.regions,
    { regionId: r1.id, storedResources: 0, expansionAbove: null, expansionBelow: null },
    { regionId: r2.id, storedResources: 0, expansionAbove: null, expansionBelow: null },
  ]

  const regionIndices: [number, number] = [newRegions.length - 2, newRegions.length - 1]

  const principality = player.principality.map((s, i) =>
    i === slotIndex
      ? { kind: 'settlement' as const, cardId: 'settlement', regionIndices, expansionSlots: [null, null] }
      : s
  )

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...player,
        principality,
        regions: newRegions,
        playedCards: [...player.playedCards, 'settlement'],
      },
    },
  }
}

function applyBuildCity(state: GameState, actingPlayer: PlayerId, slotIndex: number): GameState {
  const player = state.players[actingPlayer]
  const cost = { grain: 2, ore: 3 }
  if (!canAfford(availableResources(player), cost)) return state

  const slot = player.principality[slotIndex]
  if (!slot || slot.kind !== 'settlement') return state

  // City expands to 4 expansion slots (existing 2 + 2 new)
  const principality = player.principality.map((s, i) =>
    i === slotIndex
      ? { ...s, kind: 'city' as const, cardId: 'city', expansionSlots: [...s.expansionSlots, null, null] }
      : s
  )

  // Upgrade one 'settlement' entry to 'city' in the stat-count list. The specific
  // settlement on the board is identified by slotIndex above; playedCards only
  // affects derived totals, so replacing any one entry keeps the counts correct.
  const settlementIdx = player.playedCards.indexOf('settlement')
  const playedCards = [...player.playedCards]
  if (settlementIdx !== -1) playedCards[settlementIdx] = 'city'

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...spendFromRegions(player, cost),
        principality,
        playedCards,
      },
    },
  }
}

function applyPlaceExpansion(
  state: GameState,
  actingPlayer: PlayerId,
  cardId: string,
  slotIndex: number,
  expansionSlotIndex: number
): GameState {
  const player = state.players[actingPlayer]
  const card = CARD_REGISTRY[cardId]
  if (!card) return state
  if (!player.hand.includes(cardId)) return state
  if (!canAfford(availableResources(player), card.cost ?? {})) return state

  const slot = player.principality[slotIndex]
  if (!slot) return state

  // Validate placement rules
  if (card.expansionColor === 'red' && slot.kind !== 'city') return state
  if (card.expansionColor === 'brown') {
    // Brown goes on region — handled separately via region index
    return state
  }
  if (slot.expansionSlots[expansionSlotIndex] !== null) return state

  const principality = player.principality.map((s, i) => {
    if (i !== slotIndex) return s
    const slots = [...s.expansionSlots]
    slots[expansionSlotIndex] = cardId
    return { ...s, expansionSlots: slots }
  })

  let newState: GameState = {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...spendFromRegions(player, card.cost ?? {}),
        hand: removeFirst(player.hand, cardId),
        principality,
        playedCards: [...player.playedCards, cardId],
      },
    },
  }

  if (card.customEffect) {
    newState = card.customEffect(newState, actingPlayer)
  }

  return newState
}

function applyPlaceRegionExpansion(
  state: GameState,
  actingPlayer: PlayerId,
  cardId: string,
  regionIndex: number,
  position: RegionExpansionPosition
): GameState {
  if (state.phase !== 'action') return state
  const player = state.players[actingPlayer]
  const card = CARD_REGISTRY[cardId]
  if (!card || card.expansionColor !== 'brown') return state
  if (!player.hand.includes(cardId)) return state
  if (!canAfford(availableResources(player), card.cost ?? {})) return state

  const region = player.regions[regionIndex]
  if (!region) return state
  const field = position === 'above' ? 'expansionAbove' : 'expansionBelow'
  if (region[field] !== null) return state

  // Spend the cost from regions first, then attach the expansion to the region.
  const spent = spendFromRegions(player, card.cost ?? {})
  const regions = spent.regions.map((r, i) =>
    i === regionIndex ? { ...r, [field]: cardId } : r
  )

  let newState: GameState = {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...player,
        hand: removeFirst(player.hand, cardId),
        regions,
        playedCards: [...player.playedCards, cardId],
      },
    },
  }
  if (card.customEffect) newState = card.customEffect(newState, actingPlayer)
  return newState
}

function applyDemolish(
  state: GameState,
  actingPlayer: PlayerId,
  slotIndex: number,
  expansionSlotIndex: number
): GameState {
  if (state.phase !== 'action') return state
  const player = state.players[actingPlayer]
  const slot = player.principality[slotIndex]
  if (!slot) return state
  const cardId = slot.expansionSlots[expansionSlotIndex]
  if (!cardId) return state

  const principality = player.principality.map((s, i) => {
    if (i !== slotIndex) return s
    const slots = [...s.expansionSlots]
    slots[expansionSlotIndex] = null
    return { ...s, expansionSlots: slots }
  })
  const playedCards = [...player.playedCards]
  const pIdx = playedCards.indexOf(cardId)
  if (pIdx !== -1) playedCards.splice(pIdx, 1)

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: { ...player, principality, playedCards },
    },
    discardPile: [...state.discardPile, cardId],
  }
}

function applyDemolishRegionExpansion(
  state: GameState,
  actingPlayer: PlayerId,
  regionIndex: number,
  position: RegionExpansionPosition
): GameState {
  if (state.phase !== 'action') return state
  const player = state.players[actingPlayer]
  const region = player.regions[regionIndex]
  if (!region) return state
  const field = position === 'above' ? 'expansionAbove' : 'expansionBelow'
  const cardId = region[field]
  if (!cardId) return state

  const regions = player.regions.map((r, i) =>
    i === regionIndex ? { ...r, [field]: null } : r
  )
  const playedCards = [...player.playedCards]
  const pIdx = playedCards.indexOf(cardId)
  if (pIdx !== -1) playedCards.splice(pIdx, 1)

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: { ...player, regions, playedCards },
    },
    discardPile: [...state.discardPile, cardId],
  }
}

/** Whether a card grants a benefit that stays active while the card is "in play"
 *  (vs. a one-shot gain). Such action cards are kept in playedCards so their effect
 *  persists, since computePlayerStats only counts playedCards. */
function hasPersistentEffect(card: CardDefinition): boolean {
  return card.effects.some(e =>
    e.type === 'GRANT_SYMBOL' || e.type === 'GRANT_VP' || e.type === 'IMPROVED_TRADE'
  )
}

function applyPlayActionCard(state: GameState, actingPlayer: PlayerId, cardId: string): GameState {
  if (state.phase !== 'action') return state
  const player = state.players[actingPlayer]
  const card = CARD_REGISTRY[cardId]
  if (!card || card.category !== 'action') return state
  if (!player.hand.includes(cardId)) return state

  // Persistent cards (e.g. Invention's progress) stay in playedCards so the engine
  // keeps counting them; one-shot cards (e.g. Celebration) go to the discard pile.
  const persistent = hasPersistentEffect(card)
  const handAfter = { ...player, hand: removeFirst(player.hand, cardId) }
  let newState: GameState = persistent
    ? {
        ...state,
        players: {
          ...state.players,
          [actingPlayer]: { ...handAfter, playedCards: [...player.playedCards, cardId] },
        },
      }
    : {
        ...state,
        players: { ...state.players, [actingPlayer]: handAfter },
        discardPile: [...state.discardPile, cardId],
      }

  // Apply one-shot declarative effects. (Persistent effects are read from playedCards
  // by computePlayerStats and must NOT be applied here, to avoid double-counting.)
  for (const effect of card.effects) {
    if (effect.type === 'GRANT_RESOURCE') {
      newState = {
        ...newState,
        players: {
          ...newState.players,
          [actingPlayer]: addToRegions(newState.players[actingPlayer], { [effect.resource]: effect.amount }),
        },
      }
    }
  }

  if (card.customEffect) {
    newState = card.customEffect(newState, actingPlayer)
  }

  return newState
}

function applyTradeWithBank(
  state: GameState,
  actingPlayer: PlayerId,
  give: ResourceType,
  receive: ResourceType
): GameState {
  if (state.phase !== 'action') return state
  if (give === receive) return state
  const player = state.players[actingPlayer]
  const rate = getTradeRate(player, give)
  if (availableResources(player)[give] < rate) return state

  // Spend `rate` of the given resource from regions, gain 1 of the received resource.
  const traded = addToRegions(spendFromRegions(player, { [give]: rate }), { [receive]: 1 })
  return {
    ...state,
    players: { ...state.players, [actingPlayer]: traded },
  }
}

// ─── Player-to-Player Trade ─────────────────────────────────────────────────────

/** Active player offers a resource trade to the opponent. Only one offer at a time. */
function applyProposeTrade(
  state: GameState,
  actingPlayer: PlayerId,
  give: Partial<Resources>,
  receive: Partial<Resources>,
): GameState {
  if (state.phase !== 'action') return state
  if (state.pendingTrade) return state  // an offer is already on the table
  // Proposer must currently hold what they're offering.
  if (!canAfford(availableResources(state.players[actingPlayer]), give)) return state
  // A trade must actually move something each way.
  if (totalOf(give) === 0 || totalOf(receive) === 0) return state

  return { ...state, pendingTrade: { from: actingPlayer, give, receive } }
}

/** The opponent (or proposer) responds to the pending offer. */
function applyRespondTrade(state: GameState, actingPlayer: PlayerId, accept: boolean): GameState {
  const offer = state.pendingTrade
  if (!offer) return state

  // Decline / cancel: either party may clear the offer.
  if (!accept) return { ...state, pendingTrade: null }

  // Only the opponent of the proposer may accept.
  const responder = opponent(offer.from)
  if (actingPlayer !== responder) return state

  // Both sides must be able to honour the trade.
  if (!canAfford(availableResources(state.players[offer.from]), offer.give)) return { ...state, pendingTrade: null }
  if (!canAfford(availableResources(state.players[responder]), offer.receive)) return { ...state, pendingTrade: null }

  // Proposer gives `give` and gains `receive`; responder does the inverse.
  const proposer = addToRegions(spendFromRegions(state.players[offer.from], offer.give), offer.receive)
  const accepter = addToRegions(spendFromRegions(state.players[responder], offer.receive), offer.give)

  return {
    ...state,
    players: { ...state.players, [offer.from]: proposer, [responder]: accepter },
    pendingTrade: null,
  }
}

function totalOf(r: Partial<Resources>): number {
  return Object.values(r).reduce((sum, n) => sum + (n ?? 0), 0)
}

function applyEndActionPhase(state: GameState, actingPlayer: PlayerId): GameState {
  if (state.phase !== 'action') return state
  if (state.activePlayer !== actingPlayer) return state

  const player = state.players[actingPlayer]
  const stats = computePlayerStats(player)
  const handSize = player.hand.length

  // Start the end-of-turn flow with a clean refill record (drives the Phase 4 swap lock).
  const cleared = {
    ...state,
    players: { ...state.players, [actingPlayer]: { ...player, drawnThisTurn: [] } },
  }

  if (handSize === stats.handLimit) {
    return { ...cleared, phase: 'swap' }
  }
  return { ...cleared, phase: 'hand-check' }
}

/** Decks the player may draw refill cards from (the Event deck is never a hand source). */
const DRAW_DECKS: DeckId[] = ['green', 'red', 'brown', 'yellow']

/** Discard the chosen cards (when over the hand limit). Drawing back up to the limit
 *  is a separate, player-driven step (DRAW_TO_LIMIT). */
function applyDiscardToLimit(state: GameState, actingPlayer: PlayerId, cardIds: string[]): GameState {
  if (state.phase !== 'hand-check') return state
  const player = state.players[actingPlayer]
  const stats = computePlayerStats(player)

  const hand = [...player.hand]
  const discarded: string[] = []

  for (const id of cardIds) {
    const idx = hand.indexOf(id)
    if (idx !== -1) {
      discarded.push(...hand.splice(idx, 1))
    }
  }

  if (hand.length > stats.handLimit) return state  // still over limit

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: { ...player, hand },
    },
    discardPile: [...state.discardPile, ...discarded],
    // Exactly at the limit → swap; below → stay in hand-check to draw.
    phase: hand.length === stats.handLimit ? 'swap' : 'hand-check',
  }
}

/** Draw one card from the chosen deck to refill toward the hand limit. Advances to the
 *  swap phase once at the limit, or if no draw deck has cards left (avoids a soft-lock). */
function applyDrawToLimit(state: GameState, actingPlayer: PlayerId, fromDeck: DeckId): GameState {
  if (state.phase !== 'hand-check') return state
  const player = state.players[actingPlayer]
  const stats = computePlayerStats(player)

  let hand = player.hand
  let decks = state.decks
  let drawnThisTurn = player.drawnThisTurn
  if (hand.length < stats.handLimit) {
    const deck = state.decks[fromDeck]
    if (deck.length > 0) {
      const drawn = deck[deck.length - 1]
      hand = [...hand, drawn]
      decks = { ...state.decks, [fromDeck]: deck.slice(0, -1) }
      // Record the draw so Phase 4 can forbid swapping it away.
      drawnThisTurn = [...drawnThisTurn, drawn]
    }
  }

  const exhausted = DRAW_DECKS.every(d => decks[d].length === 0)
  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: { ...player, hand, drawnThisTurn },
    },
    decks,
    phase: hand.length >= stats.handLimit || exhausted ? 'swap' : 'hand-check',
  }
}

/** A card may be swapped away only if the hand holds more copies of it than were drawn
 *  this turn during the refill — a card drawn this turn can never be the one placed under
 *  a deck (GAME_LOGIC.md §3 Phase 4). */
export function canSwapAway(hand: string[], drawnThisTurn: string[], cardId: string): boolean {
  const held = hand.filter(c => c === cardId).length
  const drawn = drawnThisTurn.filter(c => c === cardId).length
  return held > drawn
}

function applyFreeSwap(state: GameState, actingPlayer: PlayerId, discardCardId: string, fromDeck: DeckId): GameState {
  if (state.phase !== 'swap') return state
  const player = state.players[actingPlayer]
  const deck = state.decks[fromDeck]
  if (deck.length === 0) return state
  if (!player.hand.includes(discardCardId)) return state
  if (!canSwapAway(player.hand, player.drawnThisTurn, discardCardId)) return state

  const drawnCard = deck[deck.length - 1]
  const newHand = [...removeFirst(player.hand, discardCardId), drawnCard]

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: { ...player, hand: newHand },
    },
    decks: {
      ...state.decks,
      // Draw the top (last) card; place the discarded card under the deck (index 0 = bottom).
      [fromDeck]: [discardCardId, ...deck.slice(0, -1)],
    },
    phase: 'roll',
    activePlayer: opponent(actingPlayer),
  }
}

function applyPaidSwap(
  state: GameState,
  actingPlayer: PlayerId,
  discardCardId: string,
  fromDeck: DeckId,
  searchCardId: string,
  searchDeck: DeckId,
  payWith: ResourceType
): GameState {
  if (state.phase !== 'swap') return state
  const player = state.players[actingPlayer]
  if (availableResources(player)[payWith] < 2) return state
  if (!player.hand.includes(discardCardId)) return state
  if (!canSwapAway(player.hand, player.drawnThisTurn, discardCardId)) return state

  const search = state.decks[searchDeck]
  const searchIdx = search.indexOf(searchCardId)
  if (searchIdx === -1) return state  // named card not in that deck

  // Pull the searched card out of its deck.
  const newSearchDeck = [...search]
  newSearchDeck.splice(searchIdx, 1)

  const newHand = [...removeFirst(player.hand, discardCardId), searchCardId]

  // Apply the search-deck change first, then bury the discarded card under fromDeck.
  const decks = { ...state.decks, [searchDeck]: newSearchDeck }
  decks[fromDeck] = [discardCardId, ...decks[fromDeck]]

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...spendFromRegions(player, { [payWith]: 2 }),
        hand: newHand,
      },
    },
    decks,
    phase: 'roll',
    activePlayer: opponent(actingPlayer),
  }
}

function applySkipSwap(state: GameState, actingPlayer: PlayerId): GameState {
  if (state.phase !== 'swap') return state
  return {
    ...state,
    phase: 'roll',
    activePlayer: opponent(actingPlayer),
  }
}

// ─── Main Reducer ─────────────────────────────────────────────────────────────

export function applyAction(state: GameState, actingPlayer: PlayerId, action: GameAction): GameState {
  // Only the active player may act, except where the opponent must respond:
  // discarding to the hand limit, accepting/declining a pending trade offer, and
  // answering a pending resource choice they own (e.g. Harvest's opponent, or a guest
  // holding the Trade Token). The choice owner is verified inside applyChooseResource.
  const opponentAllowed: GameAction['type'][] = ['DISCARD_TO_LIMIT', 'ACCEPT_TRADE', 'DECLINE_TRADE', 'CHOOSE_RESOURCE']
  if (!opponentAllowed.includes(action.type) && state.activePlayer !== actingPlayer) return state

  let next: GameState
  switch (action.type) {
    case 'ROLL_DICE':          next = applyRollDice(state); break
    case 'BUILD_ROAD':         next = applyBuildRoad(state, actingPlayer, action.slotIndex); break
    case 'BUILD_SETTLEMENT':   next = applyBuildSettlement(state, actingPlayer, action.slotIndex); break
    case 'BUILD_CITY':         next = applyBuildCity(state, actingPlayer, action.slotIndex); break
    case 'PLACE_EXPANSION':    next = applyPlaceExpansion(state, actingPlayer, action.cardId, action.slotIndex, action.expansionSlotIndex); break
    case 'PLACE_REGION_EXPANSION': next = applyPlaceRegionExpansion(state, actingPlayer, action.cardId, action.regionIndex, action.position); break
    case 'PLAY_ACTION_CARD':   next = applyPlayActionCard(state, actingPlayer, action.cardId); break
    case 'TRADE_WITH_BANK':    next = applyTradeWithBank(state, actingPlayer, action.give, action.receive); break
    case 'CHOOSE_RESOURCE':    next = applyChooseResource(state, actingPlayer, action.resource); break
    case 'PROPOSE_TRADE':      next = applyProposeTrade(state, actingPlayer, action.give, action.receive); break
    case 'ACCEPT_TRADE':       next = applyRespondTrade(state, actingPlayer, true); break
    case 'DECLINE_TRADE':      next = applyRespondTrade(state, actingPlayer, false); break
    case 'DEMOLISH':           next = applyDemolish(state, actingPlayer, action.slotIndex, action.expansionSlotIndex); break
    case 'DEMOLISH_REGION_EXPANSION': next = applyDemolishRegionExpansion(state, actingPlayer, action.regionIndex, action.position); break
    case 'END_ACTION_PHASE':   next = applyEndActionPhase(state, actingPlayer); break
    case 'DISCARD_TO_LIMIT':   next = applyDiscardToLimit(state, actingPlayer, action.cardIds); break
    case 'DRAW_TO_LIMIT':      next = applyDrawToLimit(state, actingPlayer, action.fromDeck); break
    case 'FREE_SWAP':          next = applyFreeSwap(state, actingPlayer, action.discardCardId, action.fromDeck); break
    case 'PAID_SWAP':          next = applyPaidSwap(state, actingPlayer, action.discardCardId, action.fromDeck, action.searchCardId, action.searchDeck, action.payWith); break
    case 'SKIP_SWAP':          next = applySkipSwap(state, actingPlayer); break
    default:                   next = state
  }

  return { ...next, winner: checkVictory(next) }
}

// ─── Projection ───────────────────────────────────────────────────────────────

export function projectForGuest(state: GameState): ProjectedState {
  const { hand: _hostHand, ...hostRest } = state.players.host
  return {
    ...state,
    players: {
      host: { ...hostRest, hand: _hostHand.length },
      guest: state.players.guest,
    },
  }
}
