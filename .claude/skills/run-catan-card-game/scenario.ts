// Build a named GameState with the real engine and print it as JSON.
//   npx tsx .claude/skills/run-catan-card-game/scenario.ts <name> [seed] > /tmp/state.json
// Feed the JSON to engine.ts (headless) or browser.mjs (practice mode in Chromium).
// Add a scenario by adding an entry to SCENARIOS; keep the helpers below generic.
import { applyAction, applyRoll, createInitialState } from '../../../src/engine/engine'
import type { CentralSlot, DiceRoll, GameState, PlayerId, PlayerState, Resources, ResourceType } from '../../../src/engine/types'
import { getRegion } from '../../../src/engine/regions'

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** A fresh game, still in setup (both players pick starting cards in the UI). */
export function fresh(seed = 1): GameState {
  return createInitialState({ vpTarget: 12, language: 'en' }, mulberry32(seed))
}

/** A fresh game with setup done the plain way (each player takes the top 3 of the first free
 *  stack): turn 1, roll phase, host to act. */
export function afterSetup(seed = 1): GameState {
  let s = { ...fresh(seed), activePlayer: 'host' as PlayerId, setup: { firstPlayer: 'host' as PlayerId, picked: {} } }
  for (const p of ['host', 'guest'] as PlayerId[]) {
    const deck = (['stack-1', 'stack-2'] as const)[p === 'host' ? 0 : 1]
    s = applyAction(s, p, { type: 'SEARCH_STACK', deck })
    s = applyAction(s, p, { type: 'TAKE_FROM_SEARCH', cardIds: s.decks[deck].slice(-3) })
  }
  return s
}

export function update(s: GameState, p: PlayerId, fn: (pl: PlayerState) => PlayerState): GameState {
  return { ...s, players: { ...s.players, [p]: fn(s.players[p]) } }
}

/** Put expansion cards on Building Sites: { slotIndex: [site0, site1, ...] } (null = empty).
 *  Starting principality: slot 0 and 2 are Settlements (2 sites: above, below), slot 1 the Road. */
export function place(sites: Record<number, (string | null)[]>) {
  return (pl: PlayerState): PlayerState => {
    const principality = pl.principality.map((slot, i) => (sites[i] ? { ...slot, expansionSlots: sites[i] } : slot))
    const removed = pl.principality.flatMap((slot, i) => (sites[i] ? slot.expansionSlots.filter(Boolean) as string[] : []))
    const playedCards = pl.playedCards.filter(id => !removed.includes(id))
    return { ...pl, principality, playedCards: [...playedCards, ...Object.values(sites).flat().filter(Boolean) as string[]] }
  }
}

/** Turn the Settlement at `slotIndex` into a City (4 sites). */
export function city(slotIndex: number) {
  return (pl: PlayerState): PlayerState => {
    const principality: CentralSlot[] = pl.principality.map((slot, i) =>
      i === slotIndex ? { ...slot, kind: 'city', cardId: 'city', expansionSlots: [slot.expansionSlots[0], null, slot.expansionSlots[1], null] } : slot)
    const playedCards = [...pl.playedCards]
    playedCards[playedCards.indexOf('settlement')] = 'city'
    return { ...pl, principality, playedCards }
  }
}

export const hand = (cards: string[]) => (pl: PlayerState): PlayerState => ({ ...pl, hand: cards })

/** Set every Region of a resource type to hold `n` (0–3). */
export function stock(amounts: Partial<Resources>) {
  return (pl: PlayerState): PlayerState => ({
    ...pl,
    regions: pl.regions.map(r => {
      const n = amounts[getRegion(r.regionId).resourceType as ResourceType]
      return n === undefined ? r : { ...r, storedResources: n }
    }),
  })
}

/** Move an event card to the top of the event deck. */
export function eventOnTop(s: GameState, cardId: string): GameState {
  return { ...s, decks: { ...s.decks, event: [...s.decks.event.filter(c => c !== cardId), cardId] } }
}

/** Resolve a roll with fixed dice (state must be in the roll phase). */
export const roll = (s: GameState, eventSymbol: DiceRoll['eventSymbol'], productionNumber: DiceRoll['productionNumber']) =>
  applyRoll(s, { eventSymbol, productionNumber })

/** Mid-game, roll phase, host to act: each player has a City at slot 0 (≥7 VP combined, so
 *  Action Cards are unlocked) and 2 of every resource. */
export function midGame(seed = 1): GameState {
  let s = { ...afterSetup(seed), turn: 10 }
  for (const p of ['host', 'guest'] as PlayerId[]) {
    s = update(s, p, pl => stock({ lumber: 2, wool: 2, brick: 2, ore: 2, grain: 2, gold: 2 })(city(0)(pl)))
  }
  return s
}

// ─── Scenarios ─────────────────────────────────────────────────────────────────

const SCENARIOS: Record<string, (seed: number) => GameState> = {
  /** Setup phase of a new game. */
  setup: fresh,
  /** Turn 1, roll phase. */
  'turn-1': afterSetup,
  /** Turn 10, roll phase, Cities + resources on both sides, Action Cards unlocked. */
  'mid-game': midGame,
  /** Mid-game, action phase: a Brigand roll in the grace period (turn ≤ 4) does nothing, production 3. */
  'mid-game-action': seed => roll({ ...midGame(seed), turn: 3 }, 'brigand', 3),
  /** Civil War just revealed: host must pick 1 of guest's 2 units, then guest 1 of host's 2;
   *  both hands are at the limit, so both must discard 1 afterwards. */
  'civil-war': seed => {
    let s = midGame(seed)
    s = update(s, 'host', pl => hand(['abbey', 'smithy', 'mint'])(place({ 0: ['knight-conrad', null, 'fleet-ore', null] })(pl)))
    s = update(s, 'guest', pl => hand(['library', 'garrison', 'marketplace'])(place({ 0: ['knight-karl', null, null, null], 2: ['fleet-wool', null] })(pl)))
    return roll(eventOnTop(s, 'event-civil-war'), 'event', 6)
  },
  /** Action phase, host holds a Black Knight; guest has 2 Knights, a Herb Woman and a full hand
   *  (so a returned Knight forces an immediate discard). */
  'black-knight': seed => {
    let s: GameState = { ...midGame(seed), phase: 'action' }
    s = update(s, 'host', pl => hand(['black-knight', 'abbey'])(place({ 0: ['knight-conrad', null, null, null] })(pl)))
    return update(s, 'guest', pl => hand(['herb-woman', 'smithy', 'mint'])(place({ 0: ['knight-karl', null, null, null], 2: ['knight-otto', null] })(pl)))
  },
  /** Action phase, host holds Arsonist, Brigands and Merchant and has full Ore; guest has a
   *  Library, an Abbey and a Knight placed, full Wool, a Bishop and a hand at the limit (5), so a
   *  burnt Library forces discarding 2. */
  'arsonist-brigands': seed => {
    let s: GameState = { ...midGame(seed), phase: 'action' }
    s = update(s, 'host', pl => stock({ ore: 3 })(hand(['arsonist', 'brigands', 'merchant'])(pl)))
    return update(s, 'guest', pl => stock({ wool: 3 })(hand(['bishop', 'smithy', 'mint', 'church', 'garrison'])(
      place({ 0: ['library', null, 'knight-karl', null], 2: ['abbey', null] })(pl))))
  },
  /** Action phase, host holds a Spy, a placed Knight (Knight Token: 7 VP combined) and 2 of
   *  everything (enough to build a stolen Knight); guest has an Abbey (limit 4) and a hand of a
   *  Knight, a Fleet, a Herb Woman and a Mint. */
  spy: seed => {
    const s: GameState = update({ ...midGame(seed), phase: 'action' }, 'host', pl => hand(['spy'])(place({ 0: ['knight-conrad', null, null, null] })(pl)))
    return update(s, 'guest', pl => hand(['knight-hagen', 'fleet-gold', 'herb-woman', 'mint'])(place({ 2: ['abbey', null] })(pl)))
  },
  /** Conflict just revealed (production 6) on the host's roll; the host holds the Knight Token and
   *  must pick 2 of the guest's 3 cards and a stack. */
  conflict: seed => {
    let s = update(midGame(seed), 'host', pl => hand(['abbey'])(place({ 0: ['knight-conrad', null, null, null] })(pl)))
    s = update(s, 'guest', hand(['library', 'smithy', 'black-knight']))
    return roll(eventOnTop(s, 'event-conflict'), 'event', 6)
  },
  /** Like `conflict`, but the guest holds the Knight Token: they pick from the roller's hand. */
  'conflict-offturn': seed => {
    let s = update(midGame(seed), 'host', hand(['library', 'smithy', 'black-knight']))
    s = update(s, 'guest', pl => hand(['abbey'])(place({ 0: ['knight-conrad', null, null, null] })(pl)))
    return roll(eventOnTop(s, 'event-conflict'), 'event', 6)
  },
  /** Master Builder just revealed (production 6) on the host's roll: the host looks through a stack
   *  and may swap 1 card, then the guest with a different stack. */
  'master-builder': seed => {
    let s = update(midGame(seed), 'host', hand(['abbey', 'smithy']))
    s = update(s, 'guest', hand(['library', 'mint', 'spy']))
    return roll(eventOnTop(s, 'event-master-builder'), 'event', 6)
  },
}

const isMain = process.argv[1]?.endsWith('scenario.ts')
if (isMain) {
  const [name, seed] = process.argv.slice(2)
  const build = SCENARIOS[name]
  if (!build) {
    console.error(`usage: scenario.ts <name> [seed]\nscenarios: ${Object.keys(SCENARIOS).join(', ')}`)
    process.exit(1)
  }
  console.log(JSON.stringify(build(Number(seed ?? 1))))
}
