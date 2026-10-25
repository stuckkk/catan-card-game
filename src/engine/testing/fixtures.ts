import { availableResources } from '../engine'
import type { GameState, PlayerState, PlayerId, Resources, ResourceType, RegionState, DiceRoll, DeckId, CentralSlot } from '../types'

// Deterministic builders for the engine tests (no RNG).

export const emptyDecks = (): Record<DeckId, string[]> => ({
  'stack-1': [], 'stack-2': [], 'stack-3': [], 'stack-4': [], 'stack-5': [], event: [],
})

/** The 6 starting-board regions in index order. Indices 0–2 are the top row, 3–5 the bottom.
 *  Settlement A borders 0,3 (left) and 1,4 (right); Settlement B borders 1,4 and 2,5. */
export const BOARD_REGIONS: Record<ResourceType, string> = {
  lumber: 'forest-4',      // 0 top-left
  wool: 'pasture-3',       // 1 top-middle (shared)
  brick: 'hills-5',        // 2 top-right
  ore: 'mountains-2',      // 3 bottom-left
  grain: 'fields-1',       // 4 bottom-middle (shared)
  gold: 'goldfield-6',     // 5 bottom-right
}
export const BOARD_ORDER: ResourceType[] = ['lumber', 'wool', 'brick', 'ore', 'grain', 'gold']

/** Starting-layout regions holding the given amounts; amounts over 3 spill into extra
 *  off-board regions of the same type (only used for resource-count tests). */
export function regionsWith(over: Partial<Resources> = {}): RegionState[] {
  const regions: RegionState[] = BOARD_ORDER.map(t => ({ regionId: BOARD_REGIONS[t], storedResources: 0 }))
  for (const [r, total] of Object.entries(over) as [ResourceType, number][]) {
    const base = regions[BOARD_ORDER.indexOf(r)]
    base.storedResources = Math.min(3, total)
    for (let left = total - base.storedResources; left > 0; left -= 3) {
      regions.push({ regionId: BOARD_REGIONS[r], storedResources: Math.min(3, left) })
    }
  }
  return regions
}

export const settlementA = (sites: (string | null)[] = [null, null]): CentralSlot =>
  ({ kind: sites.length === 4 ? 'city' : 'settlement', cardId: sites.length === 4 ? 'city' : 'settlement', regionIndices: [0, 3, 1, 4], expansionSlots: sites })
export const road = (): CentralSlot => ({ kind: 'road', cardId: 'road', regionIndices: [], expansionSlots: [] })
export const settlementB = (sites: (string | null)[] = [null, null]): CentralSlot =>
  ({ kind: sites.length === 4 ? 'city' : 'settlement', cardId: sites.length === 4 ? 'city' : 'settlement', regionIndices: [1, 4, 2, 5], expansionSlots: sites })

/** Played-card list matching a principality (central cards + placed expansions). */
export function playedFor(principality: CentralSlot[], extra: string[] = []): string[] {
  const out: string[] = []
  for (const s of principality) {
    if (s.cardId) out.push(s.cardId)
    for (const e of s.expansionSlots) if (e) out.push(e)
  }
  return [...out, ...extra]
}

export function makePlayer(id: PlayerId, over: Partial<PlayerState> = {}): PlayerState {
  const principality = over.principality ?? [settlementA(), road(), settlementB()]
  return {
    id,
    hand: [],
    principality,
    regions: regionsWith(),
    playedCards: playedFor(principality),
    ...over,
  }
}

export function makeState(over: Partial<GameState> = {}): GameState {
  return {
    sessionId: 'test',
    config: { vpTarget: 12, language: 'en' },
    players: { host: makePlayer('host'), guest: makePlayer('guest') },
    activePlayer: 'host',
    phase: 'action',
    turn: 10,
    setup: { firstPlayer: 'host', picked: { host: 'stack-1', guest: 'stack-2' } },
    lastRoll: null,
    alchemistNumber: null,
    winner: null,
    decks: emptyDecks(),
    regionStack: [],
    supply: { road: 7, settlement: 5, city: 7 },
    discardPile: [],
    search: null,
    pendingTrade: null,
    pendingChoices: [],
    eventLog: [],
    ...over,
  }
}

/** A state where both players together have ≥7 VP, so Action Cards are unlocked. */
export function unlocked(over: Partial<GameState> = {}): GameState {
  const big = [settlementA([null, null, null, null]), road(), settlementB([null, null, null, null])]  // 2 cities = 4 VP
  return makeState({
    players: {
      host: makePlayer('host', { principality: big, playedCards: playedFor(big) }),
      guest: makePlayer('guest', { principality: big, playedCards: playedFor(big) }),
    },
    ...over,
  })
}

export const res = (p: PlayerState) => availableResources(p)
export const roll = (eventSymbol: DiceRoll['eventSymbol'], productionNumber: DiceRoll['productionNumber'] = 3): DiceRoll =>
  ({ eventSymbol, productionNumber })
