// ─── Primitives ──────────────────────────────────────────────────────────────

export type PlayerId = 'host' | 'guest'

export type ResourceType = 'lumber' | 'wool' | 'brick' | 'ore' | 'grain' | 'gold'
export type Resources = Record<ResourceType, number>

export const EMPTY_RESOURCES: Resources = {
  lumber: 0, wool: 0, brick: 0, ore: 0, grain: 0, gold: 0,
}

export type ProductionNumber = 1 | 2 | 3 | 4 | 5 | 6
/** Event Die faces (GAME_LOGIC.md §6). 'event' (the "?" Event Card face) appears twice. */
export type EventSymbol = 'brigand' | 'commerce' | 'tournament' | 'yearOfPlenty' | 'event'

export type SymbolType = 'strength' | 'commerce' | 'tournament'

/** The 5 face-down expansion stacks. Expansion Cards (yellow/green/red) are shuffled
 *  together and split across these; a draw is type-blind. */
export type DrawStackId = 'stack-1' | 'stack-2' | 'stack-3' | 'stack-4' | 'stack-5'
export type DeckId = DrawStackId | 'event'

// ─── Card Definitions (static catalog) ───────────────────────────────────────

export type CardCategory = 'road' | 'settlement' | 'city' | 'action' | 'expansion' | 'event' | 'region'

/** Green = Region Expansion (Settlement or City), red = City Expansion (City only). */
export type ExpansionColor = 'green' | 'red'

/** Knights and Trade Fleets are Units; every other expansion is a Building. */
export type ExpansionKind = 'building' | 'knight' | 'fleet'

export type DeclarativeEffect =
  | { type: 'GRANT_SYMBOL'; symbol: SymbolType; amount: number }
  /** Bank trade rate for one resource (Trade Fleet 2:1, Mint 1:1). */
  | { type: 'IMPROVED_TRADE'; resource: ResourceType; rate: 1 | 2 }
  | { type: 'INCREASE_HAND_LIMIT'; amount: number }
  /** Neighbouring Regions of this resource produce 2 instead of 1 (Mills, Foundry, …). */
  | { type: 'DOUBLE_PRODUCTION'; resource: ResourceType }
  /** Neighbouring Regions are not counted for the Brigand Attack (Garrison). */
  | { type: 'BRIGAND_PROTECTION' }
  /** +amount Strength per Knight owned (Smithy). */
  | { type: 'STRENGTH_PER_KNIGHT'; amount: number }
  /** +amount Commerce per Trade Fleet owned (Harbor). */
  | { type: 'COMMERCE_PER_FLEET'; amount: number }
  /** A Search costs 1 resource instead of 2 (Town Hall; does not stack). */
  | { type: 'SEARCH_DISCOUNT' }
  /** Plague immunity: all own Regions (Aqueduct) or the 4 Regions of its City (Bath House). */
  | { type: 'PLAGUE_PROTECTION'; scope: 'principality' | 'city' }
  /** Units on this City's Building Sites cannot be chosen for Civil War (Church). */
  | { type: 'CIVIL_WAR_PROTECTION' }

/** Player-supplied parameters for Action Cards that need choices. */
export interface ActionCardParams {
  /** Alchemist: the chosen Production Die result. */
  productionNumber?: ProductionNumber
  /** Caravan: resources traded in. Merchant: the 1 resource given to the opponent. */
  give?: ResourceType[]
  /** Caravan: resources received (same count as `give`). */
  receive?: ResourceType[]
  /** Merchant: the 1–2 resources taken from the opponent. */
  take?: ResourceType[]
}

export interface CardDefinition {
  id: string
  nameKey: string
  descriptionKey: string
  category: CardCategory
  expansionColor?: ExpansionColor
  expansionKind?: ExpansionKind
  /** Cost to build. Undefined for cards with no resource cost. */
  cost?: Partial<Resources>
  /** Static declarative effects that are always active while the card is in play. */
  effects: DeclarativeEffect[]
  /**
   * Escape hatch for effects too complex to express declaratively.
   * Action Cards: called when played (params from the PLAY_ACTION_CARD action); return null to
   * reject the play as invalid. Event Cards: called when revealed, with the roller as actingPlayer.
   */
  customEffect?: (state: GameState, actingPlayer: PlayerId, params: ActionCardParams) => GameState | null
  /** VP directly granted by this card (Settlements, Cities, some City Expansions). */
  directVP?: number
  /** Defined in the catalogue but not implemented yet: kept out of the decks (GAME_LOGIC.md §13). */
  notImplemented?: true
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
}

/** A slot on the Central Axis, alternating settlement-type slots and roads. */
export type CentralSlotKind = 'road' | 'empty-settlement' | 'settlement' | 'city'

export interface CentralSlot {
  kind: CentralSlotKind
  cardId: string | null
  /** Settlements/Cities: indices into PlayerState.regions of the 4 corner Regions, in the order
   *  [topLeft, bottomLeft, topRight, bottomRight]. Neighbours share the corners between them.
   *  Empty for roads and empty settlement sites. */
  regionIndices: number[]
  /** Building Sites. Settlement: [above, below]. City: [above, above, below, below]. */
  expansionSlots: (string | null)[]
}

// ─── Player State ─────────────────────────────────────────────────────────────

export interface PlayerState {
  id: PlayerId
  hand: string[]          // CardDefinition ids
  /** Central Axis slots, always odd-length: [settlement, road, settlement, ...]. */
  principality: CentralSlot[]
  regions: RegionState[]  // indexed by regionIndices in CentralSlot
  /** Placed permanent card IDs (roads, settlements, cities, expansions). */
  playedCards: string[]
}

// ─── Derived / Computed ───────────────────────────────────────────────────────

export interface PlayerStats {
  /** VP from cards only (tokens are added by computeVP). */
  victoryPoints: number
  strengthPoints: number
  commercePoints: number
  tournamentPoints: number
  handLimit: number
}

// ─── Turn & Game State ────────────────────────────────────────────────────────

export type TurnPhase =
  | 'setup'
  | 'roll'
  | 'event-resolution'
  | 'production'
  | 'action'
  /** Step 4: discard down to, or draw up to, the hand limit. */
  | 'draw'
  /** Step 4, optional: exchange 1 card (only if the hand was already at the limit). */
  | 'exchange'

export interface DiceRoll {
  eventSymbol: EventSymbol
  productionNumber: ProductionNumber
}

export interface GameConfig {
  vpTarget: number
  /** Language preference for the session */
  language: 'en' | 'de'
}

/** Shared supply of Development Cards (GAME_LOGIC.md §2). */
export interface Supply {
  road: number
  settlement: number
  city: number
}

/** Setup phase progress (GAME_LOGIC.md §3). */
export interface SetupState {
  /** Plays first; picks starting cards first. */
  firstPlayer: PlayerId
  /** The stack each player took their starting cards from, once they have. */
  picked: Partial<Record<PlayerId, DrawStackId>>
}

/** An open stack search: the stack's contents are revealed to `player` only. */
export interface StackSearch {
  player: PlayerId
  deck: DrawStackId
  /** setup: take 3 starting cards. draw: take 1 toward the hand limit. exchange: take 1 replacement. */
  purpose: 'setup' | 'draw' | 'exchange'
}

export interface GameState {
  sessionId: string
  config: GameConfig
  players: Record<PlayerId, PlayerState>
  activePlayer: PlayerId
  phase: TurnPhase
  /** 1-based turn counter (turn 1 = first player's first turn). */
  turn: number
  setup: SetupState
  lastRoll: DiceRoll | null
  /** Production Die result chosen with an Alchemist before this turn's roll. */
  alchemistNumber: ProductionNumber | null
  winner: PlayerId | null
  decks: Record<DeckId, string[]>   // stacks of CardDefinition ids, top = last element
  /** Shuffled Region stack (RegionDefinition ids), top = last element. */
  regionStack: string[]
  supply: Supply
  discardPile: string[]
  /** An open stack search awaiting the searcher's pick. */
  search: StackSearch | null
  /** A resource trade offered by the active player, awaiting the opponent's response. */
  pendingTrade: PendingTrade | null
  /** Interactive prompts awaiting input, FIFO. Index 0 is the active prompt; while non-empty,
   *  event resolution is paused (phase stays 'event-resolution') and, in the action phase, the
   *  active player can do nothing else (e.g. during an attack). */
  pendingChoices: PendingChoice[]
  /** Log of human-readable event keys for the action log UI */
  eventLog: GameEvent[]
}

/** A proposed player-to-player resource trade, from the proposer's perspective. */
export interface PendingTrade {
  from: PlayerId
  give: Partial<Resources>     // resources the proposer gives away
  receive: Partial<Resources>  // resources the proposer wants in return
}

/** Why a player is being asked to pick a resource — drives the picker's label. */
export type ResourceChoiceReason = 'commerce' | 'yearOfPlenty' | 'tournament' | 'progress'

/** A pending interactive "choose a resource" prompt owned by one player. The engine
 *  pauses event resolution until the owner submits a CHOOSE_RESOURCE action. */
export interface PendingResourceChoice {
  kind: 'resource'
  /** The player who must pick. */
  player: PlayerId
  /** What triggered the choice. */
  reason: ResourceChoiceReason
  /** Resource types offered. Commerce: only resources the opponent holds. Otherwise all six. */
  options: ResourceType[]
  /** Commerce: the opponent the chosen resource is taken from. Otherwise null (from the bank). */
  takeFrom: PlayerId | null
}

/** A Building Site on a principality: the Settlement/City slot and the site within it. */
export interface SiteRef {
  slotIndex: number
  expansionSlotIndex: number
}

/** Pick one of `owner`'s placed cards that goes back to their hand (Civil War: a Knight or
 *  Fleet; Black Knight: a Knight).
 *  A prompt with a single option resolves itself; one with none is dropped. */
export interface PendingPlacedCardChoice {
  kind: 'placedCard'
  /** The player who picks. */
  player: PlayerId
  /** The player whose card it is. */
  owner: PlayerId
  reason: 'civilWar' | 'blackKnight'
  options: SiteRef[]
}

/** Put the cards above the hand limit under stack(s) of `player`'s choice, right now (outside
 *  the draw phase). The excess is computed when the prompt comes up; it is dropped if there
 *  is none by then. */
export interface PendingDiscard {
  kind: 'discard'
  player: PlayerId
}

/** Attack duel, step 1: the defender may play the counter card (Herb Woman vs Black Knight)
 *  before the attacker rolls. Always asked, so the pause reveals nothing about their hand. */
export interface PendingCounter {
  kind: 'counter'
  /** The defender. */
  player: PlayerId
  attacker: PlayerId
  attackCardId: string
}

/** Attack duel, step 2: the attacker rolls one die; they win on 1–5, or 1–2 if countered. */
export interface PendingAttackRoll {
  kind: 'attackRoll'
  /** The attacker. */
  player: PlayerId
  defender: PlayerId
  attackCardId: string
  countered: boolean
}

export type PendingChoice =
  PendingResourceChoice | PendingPlacedCardChoice | PendingDiscard | PendingCounter | PendingAttackRoll

export interface GameEvent {
  id: string
  timestamp: number
  player: PlayerId
  type: string
  payload?: Record<string, unknown>
}

// ─── Projected State (sent to a viewer) ──────────────────────────────────────

/** What one viewer may see: the opponent's hand is a count, every stack is a count, the Region
 *  stack is its (public) composition in sorted order, and an open search reveals that stack to
 *  the searcher only. */
export type ProjectedState = Omit<GameState, 'players' | 'decks' | 'regionStack'> & {
  players: Record<PlayerId, Omit<PlayerState, 'hand'> & { hand: string[] | number }>
  deckSizes: Record<DeckId, number>
  /** Region stack contents, sorted (the order stays hidden). */
  regionStack: string[]
  /** Contents of the stack the viewer is searching, top = last; null otherwise. */
  searchContents: string[] | null
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type GameAction =
  /** Setup: swap two of your 6 starting Regions (indices into your regions). */
  | { type: 'SWAP_STARTING_REGIONS'; a: number; b: number }
  /** Open a stack to look through. Setup: free. Draw phase: a paid Search (`payWith`). */
  | { type: 'SEARCH_STACK'; deck: DrawStackId; payWith?: ResourceType[] }
  /** Take card(s) from the open search: 3 in setup, otherwise 1. */
  | { type: 'TAKE_FROM_SEARCH'; cardIds: string[] }
  | { type: 'ROLL_DICE' }
  | { type: 'BUILD_ROAD'; side: 'left' | 'right' }
  /** Build on an empty settlement site. `scoutRegionIds` plays a Scout from hand: [above, below]. */
  | { type: 'BUILD_SETTLEMENT'; slotIndex: number; scoutRegionIds?: [string, string] }
  | { type: 'BUILD_CITY'; slotIndex: number }
  /** Place a Region/City Expansion on a Building Site of a Settlement/City. */
  | { type: 'PLACE_EXPANSION'; cardId: string; slotIndex: number; expansionSlotIndex: number }
  | { type: 'PLAY_ACTION_CARD'; cardId: string; params?: ActionCardParams }
  | { type: 'TRADE_WITH_BANK'; give: ResourceType; receive: ResourceType }
  /** Submit the resource pick for the active pending choice. */
  | { type: 'CHOOSE_RESOURCE'; resource: ResourceType }
  /** Submit the placed-card pick for the active pending choice (one of its options). */
  | { type: 'CHOOSE_PLACED_CARD'; slotIndex: number; expansionSlotIndex: number }
  /** Defender answers an attack: play the counter card from hand, or let the attacker roll. */
  | { type: 'ANSWER_ATTACK'; playCounter: boolean }
  /** Attacker rolls the die for the pending attack. */
  | { type: 'ROLL_ATTACK' }
  /** Active player offers a resource trade to the opponent. */
  | { type: 'PROPOSE_TRADE'; give: Partial<Resources>; receive: Partial<Resources> }
  /** Opponent accepts the pending trade offer. */
  | { type: 'ACCEPT_TRADE' }
  /** Opponent (or proposer) declines/cancels the pending trade offer. */
  | { type: 'DECLINE_TRADE' }
  /** Demolish own expansion (free, to the discard pile). */
  | { type: 'DEMOLISH'; slotIndex: number; expansionSlotIndex: number }
  | { type: 'END_ACTION_PHASE' }
  /** Over the limit (draw phase, or a pending discard): put exactly the excess cards under
   *  stacks of your choice. */
  | { type: 'DISCARD_TO_LIMIT'; discards: { cardId: string; toDeck: DrawStackId }[] }
  /** Random draw: take the top card of a stack. */
  | { type: 'DRAW_CARD'; fromDeck: DrawStackId }
  /** Exchange: put a card under `deck`, then take its top card, or Search it (`payWith`). */
  | { type: 'EXCHANGE'; cardId: string; deck: DrawStackId; payWith?: ResourceType[] }
  | { type: 'SKIP_EXCHANGE' }
