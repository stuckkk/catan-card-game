import {
  GameState, PlayerState, PlayerId, ResourceType, Resources,
  GameAction, ProjectedState, DiceRoll, EventSymbol, ProductionNumber,
  DeckId, CentralSlot, RegionState, RegionExpansionPosition,
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

function addResources(a: Resources, b: Partial<Resources>): Resources {
  return {
    wood:  a.wood  + (b.wood  ?? 0),
    wool:  a.wool  + (b.wool  ?? 0),
    gold:  a.gold  + (b.gold  ?? 0),
    brick: a.brick + (b.brick ?? 0),
    ore:   a.ore   + (b.ore   ?? 0),
    grain: a.grain + (b.grain ?? 0),
  }
}

function subtractResources(a: Resources, b: Partial<Resources>): Resources {
  return {
    wood:  a.wood  - (b.wood  ?? 0),
    wool:  a.wool  - (b.wool  ?? 0),
    gold:  a.gold  - (b.gold  ?? 0),
    brick: a.brick - (b.brick ?? 0),
    ore:   a.ore   - (b.ore   ?? 0),
    grain: a.grain - (b.grain ?? 0),
  }
}

function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (Object.keys(cost) as ResourceType[]).every(r => resources[r] >= (cost[r] ?? 0))
}

function totalResources(r: Resources): number {
  return r.wood + r.wool + r.gold + r.brick + r.ore + r.grain
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
  handLimit: number
} {
  let vp = 0
  let strength = 0
  let commerce = 0
  let progress = 0

  for (const cardId of player.playedCards) {
    const def = getCard(cardId)
    vp += def.directVP ?? 0
    for (const effect of def.effects) {
      if (effect.type === 'GRANT_SYMBOL') {
        if (effect.symbol === 'strength') strength += effect.amount
        if (effect.symbol === 'commerce') commerce += effect.amount
        if (effect.symbol === 'progress') progress += effect.amount
      }
      if (effect.type === 'GRANT_VP') vp += effect.amount
    }
  }

  return {
    victoryPoints: vp,
    strengthPoints: strength,
    commercePoints: commerce,
    progressPoints: progress,
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
    storedResources: 0,
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
    resources: { wood: 1, wool: 1, gold: 1, brick: 1, ore: 1, grain: 1 },
    hand: [],
    principality,
    regions,
    playedCards: ['settlement', 'road', 'settlement'],
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
        if (totalResources(p.resources) <= 7) return p
        return { ...p, resources: { ...p.resources, gold: 0, wool: 0 } }
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
      // Player with Trade Token takes 1 Gold from opponent
      // (simplified: takes most abundant resource)
      const hostStats = computePlayerStats(state.players.host)
      const guestStats = computePlayerStats(state.players.guest)
      const hostHasTrade = hostStats.commercePoints >= 3 && hostStats.commercePoints > guestStats.commercePoints
      const guestHasTrade = guestStats.commercePoints >= 3 && guestStats.commercePoints > hostStats.commercePoints

      let s = state
      if (hostHasTrade && s.players.guest.resources.gold > 0) {
        s = {
          ...s,
          players: {
            host: { ...s.players.host, resources: addResources(s.players.host.resources, { gold: 1 }) },
            guest: { ...s.players.guest, resources: subtractResources(s.players.guest.resources, { gold: 1 }) },
          },
        }
      } else if (guestHasTrade && s.players.host.resources.gold > 0) {
        s = {
          ...s,
          players: {
            guest: { ...s.players.guest, resources: addResources(s.players.guest.resources, { gold: 1 }) },
            host: { ...s.players.host, resources: subtractResources(s.players.host.resources, { gold: 1 }) },
          },
        }
      }
      return { ...s, phase: 'production' }
    }

    case 'festival': {
      // Both receive 1 resource unless one has strictly more Skill Points
      const hostStats = computePlayerStats(state.players.host)
      const guestStats = computePlayerStats(state.players.guest)
      const hostMajority = hostStats.progressPoints > guestStats.progressPoints
      const guestMajority = guestStats.progressPoints > hostStats.progressPoints

      let s = state
      if (!guestMajority) {
        s = { ...s, players: { ...s.players, host: { ...s.players.host, resources: addResources(s.players.host.resources, { gold: 1 }) } } }
      }
      if (!hostMajority) {
        s = { ...s, players: { ...s.players, guest: { ...s.players.guest, resources: addResources(s.players.guest.resources, { gold: 1 }) } } }
      }
      return { ...s, phase: 'production' }
    }

    case 'harvest': {
      // Both players receive 1 free resource (Gold is the generic choice)
      return {
        ...state,
        players: {
          host: { ...state.players.host, resources: addResources(state.players.host.resources, { gold: 1 }) },
          guest: { ...state.players.guest, resources: addResources(state.players.guest.resources, { gold: 1 }) },
        },
        phase: 'production',
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
              [active]: {
                ...s.players[active],
                resources: addResources(s.players[active].resources, { [effect.resource]: effect.amount }),
              },
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
  const eventSymbols: EventSymbol[] = ['bandit', 'trade', 'festival', 'harvest', 'event']
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

function applyBuildRoad(state: GameState, actingPlayer: PlayerId, slotIndex: number): GameState {
  const player = state.players[actingPlayer]
  if (!canAfford(player.resources, { wood: 1, brick: 2 })) return state

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
        ...player,
        resources: subtractResources(player.resources, { wood: 1, brick: 2 }),
        principality,
        playedCards: [...player.playedCards, 'road'],
      },
    },
  }
}

function applyBuildSettlement(state: GameState, actingPlayer: PlayerId, slotIndex: number): GameState {
  const player = state.players[actingPlayer]
  if (!canAfford(player.resources, { wood: 1, brick: 1, grain: 1, wool: 1 })) return state

  const slot = player.principality[slotIndex]
  if (!slot || slot.kind !== 'empty-settlement') return state

  // Assign 2 new regions from a shuffled pool
  const usedRegionIds = new Set(player.regions.map(r => r.regionId))
  const available = REGION_DEFINITIONS.filter(r => !usedRegionIds.has(r.id))
  if (available.length < 2) return state
  const [r1, r2] = shuffle(available)

  const newRegions = [
    ...player.regions,
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
        resources: subtractResources(player.resources, { wood: 1, brick: 1, grain: 1, wool: 1 }),
        principality,
        regions: newRegions,
        playedCards: [...player.playedCards, 'settlement'],
      },
    },
  }
}

function applyBuildCity(state: GameState, actingPlayer: PlayerId, slotIndex: number): GameState {
  const player = state.players[actingPlayer]
  if (!canAfford(player.resources, { grain: 2, ore: 3 })) return state

  const slot = player.principality[slotIndex]
  if (!slot || slot.kind !== 'settlement') return state

  // City expands to 4 expansion slots (existing 2 + 2 new)
  const principality = player.principality.map((s, i) =>
    i === slotIndex
      ? { ...s, kind: 'city' as const, cardId: 'city', expansionSlots: [...s.expansionSlots, null, null] }
      : s
  )

  // Replace 'settlement' in playedCards with 'city'
  const settlementIdx = player.playedCards.indexOf('settlement')
  const playedCards = [...player.playedCards]
  if (settlementIdx !== -1) playedCards[settlementIdx] = 'city'

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...player,
        resources: subtractResources(player.resources, { grain: 2, ore: 3 }),
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
  if (!canAfford(player.resources, card.cost ?? {})) return state

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

  const newHand = player.hand.filter((id, i) => !(id === cardId && i === player.hand.indexOf(cardId)))
  let newResources = subtractResources(player.resources, card.cost ?? {})

  let newState: GameState = {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...player,
        resources: newResources,
        hand: newHand,
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
  if (!canAfford(player.resources, card.cost ?? {})) return state

  const region = player.regions[regionIndex]
  if (!region) return state
  const field = position === 'above' ? 'expansionAbove' : 'expansionBelow'
  if (region[field] !== null) return state

  const regions = player.regions.map((r, i) =>
    i === regionIndex ? { ...r, [field]: cardId } : r
  )
  const newHand = [...player.hand]
  newHand.splice(newHand.indexOf(cardId), 1)

  let newState: GameState = {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...player,
        resources: subtractResources(player.resources, card.cost ?? {}),
        hand: newHand,
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

function applyPlayActionCard(state: GameState, actingPlayer: PlayerId, cardId: string): GameState {
  const player = state.players[actingPlayer]
  const card = CARD_REGISTRY[cardId]
  if (!card || card.category !== 'action') return state
  if (!player.hand.includes(cardId)) return state

  const newHand = [...player.hand]
  newHand.splice(newHand.indexOf(cardId), 1)

  let newState: GameState = {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: { ...player, hand: newHand },
    },
    discardPile: [...state.discardPile, cardId],
  }

  // Apply declarative effects
  for (const effect of card.effects) {
    if (effect.type === 'GRANT_RESOURCE') {
      newState = {
        ...newState,
        players: {
          ...newState.players,
          [actingPlayer]: {
            ...newState.players[actingPlayer],
            resources: addResources(newState.players[actingPlayer].resources, { [effect.resource]: effect.amount }),
          },
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
  if (player.resources[give] < rate) return state

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...player,
        resources: addResources(
          subtractResources(player.resources, { [give]: rate }),
          { [receive]: 1 }
        ),
      },
    },
  }
}

function applyEndActionPhase(state: GameState, actingPlayer: PlayerId): GameState {
  if (state.phase !== 'action') return state
  if (state.activePlayer !== actingPlayer) return state

  const stats = computePlayerStats(state.players[actingPlayer])
  const handSize = state.players[actingPlayer].hand.length

  if (handSize === stats.handLimit) {
    return { ...state, phase: 'swap' }
  }
  return { ...state, phase: 'hand-check' }
}

function applyDiscardToLimit(state: GameState, actingPlayer: PlayerId, cardIds: string[]): GameState {
  if (state.phase !== 'hand-check') return state
  const player = state.players[actingPlayer]
  const stats = computePlayerStats(player)

  let hand = [...player.hand]
  const discarded: string[] = []

  for (const id of cardIds) {
    const idx = hand.indexOf(id)
    if (idx !== -1) {
      discarded.push(...hand.splice(idx, 1))
    }
  }

  if (hand.length > stats.handLimit) return state  // still over limit

  // Draw up to limit if below
  const decks = { ...state.decks }
  while (hand.length < stats.handLimit) {
    // Draw from green deck by default; if empty, skip
    const deckIds: DeckId[] = ['green', 'yellow', 'brown', 'red']
    let drawn = false
    for (const deckId of deckIds) {
      if (decks[deckId].length > 0) {
        const drawn_card = decks[deckId][decks[deckId].length - 1]
        decks[deckId] = decks[deckId].slice(0, -1)
        hand = [...hand, drawn_card]
        drawn = true
        break
      }
    }
    if (!drawn) break
  }

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: { ...player, hand },
    },
    decks,
    discardPile: [...state.discardPile, ...discarded],
    phase: 'swap',
  }
}

function applyFreeSwap(state: GameState, actingPlayer: PlayerId, discardCardId: string, fromDeck: DeckId): GameState {
  if (state.phase !== 'swap') return state
  const player = state.players[actingPlayer]
  const deck = state.decks[fromDeck]
  if (deck.length === 0) return state
  if (!player.hand.includes(discardCardId)) return state

  const newHand = [...player.hand]
  newHand.splice(newHand.indexOf(discardCardId), 1)
  const drawnCard = deck[deck.length - 1]
  newHand.push(drawnCard)

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
  if (player.resources[payWith] < 2) return state
  if (!player.hand.includes(discardCardId)) return state

  const search = state.decks[searchDeck]
  const searchIdx = search.indexOf(searchCardId)
  if (searchIdx === -1) return state  // named card not in that deck

  // Pull the searched card out of its deck.
  const newSearchDeck = [...search]
  newSearchDeck.splice(searchIdx, 1)

  const newHand = [...player.hand]
  newHand.splice(newHand.indexOf(discardCardId), 1)
  newHand.push(searchCardId)

  // Apply the search-deck change first, then bury the discarded card under fromDeck.
  const decks = { ...state.decks, [searchDeck]: newSearchDeck }
  decks[fromDeck] = [discardCardId, ...decks[fromDeck]]

  return {
    ...state,
    players: {
      ...state.players,
      [actingPlayer]: {
        ...player,
        resources: subtractResources(player.resources, { [payWith]: 2 }),
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
  // Only active player can act (except in hand-check phase where both may need to discard)
  if (action.type !== 'DISCARD_TO_LIMIT' && state.activePlayer !== actingPlayer) return state

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
    case 'DEMOLISH':           next = applyDemolish(state, actingPlayer, action.slotIndex, action.expansionSlotIndex); break
    case 'DEMOLISH_REGION_EXPANSION': next = applyDemolishRegionExpansion(state, actingPlayer, action.regionIndex, action.position); break
    case 'END_ACTION_PHASE':   next = applyEndActionPhase(state, actingPlayer); break
    case 'DISCARD_TO_LIMIT':   next = applyDiscardToLimit(state, actingPlayer, action.cardIds); break
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
