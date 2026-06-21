// ─── Primitives ──────────────────────────────────────────────────────────────

export type PlayerId = 'host' | 'guest'

export type ResourceType = 'wood' | 'wool' | 'gold' | 'brick' | 'ore' | 'grain'
export type Resources = Record<ResourceType, number>

export const EMPTY_RESOURCES: Resources = {
  wood: 0, wool: 0, gold: 0, brick: 0, ore: 0, grain: 0,
}

export type ProductionNumber = 1 | 2 | 3 | 4 | 5 | 6
export type EventSymbol = 'bandit' | 'trade' | 'festival' | 'harvest' | 'event'

export type SymbolType = 'strength' | 'commerce' | 'progress'

export type DeckId = 'green' | 'red' | 'brown' | 'yellow' | 'event'

// ─── Card Definitions (static catalog) ───────────────────────────────────────

export type CardCategory = 'road' | 'settlement' | 'city' | 'action' | 'expansion' | 'event' | 'region'

export type ExpansionColor = 'green' | 'red' | 'brown'

export type DeclarativeEffect =
  | { type: 'GRANT_SYMBOL'; symbol: SymbolType; amount: number }
  | { type: 'GRANT_VP'; amount: number }
  | { type: 'GRANT_RESOURCE'; resource: ResourceType; amount: number }
  | { type: 'IMPROVED_TRADE'; resource: ResourceType }
  | { type: 'INCREASE_HAND_LIMIT'; amount: number }

export interface CardDefinition {
  id: string
  nameKey: string
  descriptionKey: string
  category: CardCategory
  expansionColor?: ExpansionColor
  /** Cost to build/play. Undefined for cards with no resource cost. */
  cost?: Partial<Resources>
  /** Static declarative effects that are always active while the card is in play. */
  effects: DeclarativeEffect[]
  /**
   * Escape hatch for effects too complex to express declaratively.
   * For Action Cards: called when played from hand.
   * For Expansion Cards: called once on placement.
   */
  customEffect?: (state: GameState, actingPlayer: PlayerId) => GameState
  /** VP directly granted by this card (e.g. settlements, cities, some expansions). */
  directVP?: number
}

export interface RegionDefinition {
  id: string
  nameKey: string
  resourceType: ResourceType
  productionNumber: ProductionNumber
}

// ─── Board State ─────────────────────────────────────────────────────────────

export interface RegionState {
  regionId: string
  storedResources: number  // 0–3
  expansionAbove: string | null  // CardDefinition id
  expansionBelow: string | null  // CardDefinition id
}

/** A slot on the Central Axis. Odd indices are road positions, even are settlement/city. */
export type CentralSlotKind = 'empty-road' | 'road' | 'empty-settlement' | 'settlement' | 'city'

export interface CentralSlot {
  kind: CentralSlotKind
  cardId: string | null
  /** Indices into the regions array of PlayerState. Empty for roads. Starting settlements have 3; built settlements have 2. */
  regionIndices: number[]
  /** Placed expansion card IDs. Settlements: 2 slots, Cities: 4 slots. */
  expansionSlots: (string | null)[]
}

// ─── Player State ─────────────────────────────────────────────────────────────

export interface PlayerState {
  id: PlayerId
  resources: Resources
  hand: string[]          // CardDefinition ids
  /** Central Axis slots, always odd-length: [settlement, road, settlement, road, settlement, ...] */
  principality: CentralSlot[]
  regions: RegionState[]  // indexed by regionIndices in CentralSlot
  /** Placed permanent card IDs (expansion + road + settlement + city, all played cards) */
  playedCards: string[]
}

// ─── Derived / Computed ───────────────────────────────────────────────────────

export interface PlayerStats {
  victoryPoints: number
  strengthPoints: number
  commercePoints: number
  progressPoints: number
  handLimit: number
  hasHeroToken: boolean
  hasTradeToken: boolean
}

// ─── Turn & Game State ────────────────────────────────────────────────────────

export type TurnPhase =
  | 'roll'
  | 'event-resolution'
  | 'production'
  | 'action'
  | 'hand-check'
  | 'swap'

export interface DiceRoll {
  eventSymbol: EventSymbol
  productionNumber: ProductionNumber
}

export interface GameConfig {
  vpTarget: number
  /** Language preference for the session */
  language: 'en' | 'de'
}

export interface GameState {
  sessionId: string
  config: GameConfig
  players: Record<PlayerId, PlayerState>
  activePlayer: PlayerId
  phase: TurnPhase
  lastRoll: DiceRoll | null
  winner: PlayerId | null
  decks: Record<DeckId, string[]>   // stacks of CardDefinition ids, top = last element
  discardPile: string[]
  /** Log of human-readable event keys for the action log UI */
  eventLog: GameEvent[]
}

export interface GameEvent {
  id: string
  timestamp: number
  player: PlayerId
  type: string
  payload?: Record<string, unknown>
}

// ─── Projected State (sent to Guest) ─────────────────────────────────────────

/** Host's hand is replaced with just the count. Everything else is identical. */
export type ProjectedState = Omit<GameState, 'players'> & {
  players: {
    host: Omit<PlayerState, 'hand'> & { hand: number }
    guest: PlayerState
  }
}

// ─── Actions (Guest → Host) ───────────────────────────────────────────────────

export type RegionExpansionPosition = 'above' | 'below'

export type GameAction =
  | { type: 'ROLL_DICE' }
  | { type: 'BUILD_ROAD'; slotIndex: number }
  | { type: 'BUILD_SETTLEMENT'; slotIndex: number }
  | { type: 'BUILD_CITY'; slotIndex: number }
  /** Place a Green or Red Expansion in a Settlement/City Expansion Slot. */
  | { type: 'PLACE_EXPANSION'; cardId: string; slotIndex: number; expansionSlotIndex: number }
  /** Place a Brown Expansion above or below a Region. */
  | { type: 'PLACE_REGION_EXPANSION'; cardId: string; regionIndex: number; position: RegionExpansionPosition }
  | { type: 'PLAY_ACTION_CARD'; cardId: string }
  | { type: 'TRADE_WITH_BANK'; give: ResourceType; receive: ResourceType }
  /** Demolish own Green/Red Expansion (free, to discard). */
  | { type: 'DEMOLISH'; slotIndex: number; expansionSlotIndex: number }
  /** Demolish own Brown Expansion (free, to discard). */
  | { type: 'DEMOLISH_REGION_EXPANSION'; regionIndex: number; position: RegionExpansionPosition }
  | { type: 'END_ACTION_PHASE' }
  | { type: 'DISCARD_TO_LIMIT'; cardIds: string[] }
  | { type: 'FREE_SWAP'; discardCardId: string; fromDeck: DeckId }
  /** Pay 2 of one Resource, place a card under a deck, then take a named card from any deck. */
  | { type: 'PAID_SWAP'; discardCardId: string; fromDeck: DeckId; searchCardId: string; searchDeck: DeckId; payWith: ResourceType }
  | { type: 'SKIP_SWAP' }

// ─── Network Messages ─────────────────────────────────────────────────────────

export type HostMessage =
  | { type: 'STATE_UPDATE'; state: ProjectedState }
  | { type: 'GAME_OVER'; winner: PlayerId }
  | { type: 'PING' }

export type GuestMessage =
  | { type: 'ACTION'; action: GameAction }
  | { type: 'PONG' }
  | { type: 'RECONNECTED' }
