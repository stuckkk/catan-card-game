import {
  applyAction, actionCardsUnlocked, availableResources, computePlayerStats, computeVP, doubledRegions,
  getTradeRate, produceForPlayer, searchCost, setupChooser,
} from './engine'
import { CITY, COUNTER_CARD, DRAW_STACK_IDS, ROAD, SETTLEMENT, getCard, hasAttackTarget, hasEffect, isSpyTarget } from './cards'
import { getRegion } from './regions'
import {
  ALL_RESOURCE_TYPES, addToRegions, isSettlementLike, mapPlayers, opponent, regionsBorderingCards, removeFirst,
  returnToHand, spendFromRegions, stealableTypes, totalOf, withPlayer,
} from './board'
import type {
  CardDefinition, DrawStackId, GameAction, GameState, PendingChoice, PendingRegionChoice, PlayerId, PlayerState,
  ProductionNumber, Resources, ResourceType,
} from './types'

// The computer opponent: a greedy heuristic. For each decision it lists the moves worth
// considering, plays each one on a copy of the state with the real engine, scores the result
// (evaluate) and picks the best; in the action phase it ends the phase once nothing beats
// standing still.
//
// No peeking: the bot only reads what projectStateFor(state, bot) would show it. The
// opponent's hand is only read while the bot picks from it (Spy, Conflict), a stack only while
// the bot searches it, and the Region stack's order is hidden before simulating (hideOrder).
// Moves whose outcome depends on chance or hidden cards (rolls, draws) are never simulated.

// ─── Weights ──────────────────────────────────────────────────────────────────

const VP_WEIGHT = 10
/** A Region's worth for its production over the rest of the game (per resource it yields). */
const PRODUCTION_WEIGHT = 3
const STORED_WEIGHT = 0.6
const STRENGTH_WEIGHT = 0.8
const COMMERCE_WEIGHT = 0.8
const TOURNAMENT_WEIGHT = 0.3
const HAND_LIMIT_WEIGHT = 2.5
/** An open Settlement site (with a Settlement left to build) is worth this much. */
const OPEN_SITE_WEIGHT = 4
/** Cards in hand are worth this share of their value: they still have to be paid for and placed. */
const HAND_WEIGHT = 0.4
/** The opponent's hidden hand cards, each. */
const OPPONENT_HAND_CARD = 1.5
/** How much the opponent's position counts against the bot's. */
const OPPONENT_WEIGHT = 0.6
/** A move must beat standing still by this much. */
const MARGIN = 0.1
/** A trade offer must be worth this much to accept. */
const TRADE_MARGIN = 0.5
/** The chance the opponent answers an attack with the counter card, if they hold any cards. */
const COUNTER_CHANCE = 0.3

const ACTION_CARD_VALUE: Record<string, number> = {
  alchemist: 2, arsonist: 2, bishop: 1.5, 'black-knight': 2, brigands: 2,
  caravan: 1.5, 'herb-woman': 1.5, merchant: 2, scout: 1.5, spy: 2,
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/** Whether the bot has to act now: its own prompt, search or turn, or a trade offer to answer. */
export function botShouldAct(state: GameState, bot: PlayerId): boolean {
  if (state.winner) return false
  if (offerToAnswer(state, bot)) return true
  const head = openPrompt(state)
  if (head) return head.player === bot
  if (state.search) return state.search.player === bot
  if (state.phase === 'setup') return setupChooser(state) === bot
  return state.activePlayer === bot
}

/** The head prompt, unless it is a Master Builder turn whose stack is already open (then the
 *  search is what's left to do). A prompt comes before an open search: e.g. the Region pick for
 *  a Search's payment. */
function openPrompt(state: GameState): PendingChoice | null {
  const head = state.pendingChoices[0]
  return head && !(head.kind === 'masterBuilder' && state.search) ? head : null
}

/** The bot's next action, or null if it is not the bot's move. */
export function chooseBotAction(state: GameState, bot: PlayerId): GameAction | null {
  if (!botShouldAct(state, bot)) return null
  const action = decide(hideOrder(state), bot)
  if (applyAction(state, bot, action) !== state) return action
  return fallback(state, bot)
}

/** The Region stack in a fixed order, so simulating a Settlement doesn't reveal its Regions. */
function hideOrder(state: GameState): GameState {
  return { ...state, regionStack: [...state.regionStack].sort() }
}

function offerToAnswer(state: GameState, bot: PlayerId): boolean {
  return !!state.pendingTrade && state.pendingTrade.from !== bot && !state.pendingChoices.some(c => c.kind === 'region')
}

function decide(s: GameState, me: PlayerId): GameAction {
  if (offerToAnswer(s, me)) return answerTrade(s, me)
  const head = openPrompt(s)
  if (head) return answerChoice(s, me, head)
  if (s.search) return takeFromSearch(s, me)
  switch (s.phase) {
    case 'setup': return { type: 'SEARCH_STACK', deck: largestStack(s, d => !Object.values(s.setup.picked).includes(d)) }
    case 'roll': return rollPhase(s, me)
    case 'action': return actionPhase(s, me)
    case 'draw': return drawPhase(s, me)
    case 'exchange': return exchangePhase(s, me)
    default: return { type: 'END_ACTION_PHASE' }
  }
}

/** If the chosen action is refused anyway, the first of these that the engine accepts. */
function fallback(state: GameState, me: PlayerId): GameAction | null {
  const candidates: GameAction[] = [
    { type: 'DECLINE_TRADE' },
    { type: 'END_ACTION_PHASE' },
    { type: 'SKIP_EXCHANGE' },
    { type: 'ROLL_DICE' },
    { type: 'ROLL_ATTACK' },
    { type: 'ANSWER_ATTACK', playCounter: false },
    { type: 'TAKE_FROM_SEARCH', cardIds: [] },
    ...DRAW_STACK_IDS.map((deck): GameAction => ({ type: 'DRAW_CARD', fromDeck: deck })),
    ...DRAW_STACK_IDS.map((deck): GameAction => ({ type: 'SEARCH_STACK', deck })),
  ]
  return candidates.find(a => applyAction(state, me, a) !== state) ?? null
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/** The bot's position minus a share of the opponent's. */
function evaluate(s: GameState, me: PlayerId): number {
  return playerValue(s, me, true) - OPPONENT_WEIGHT * playerValue(s, opponent(me), false)
}

function resourceWorth(player: PlayerState, type: ResourceType): number {
  return type === 'gold' && getTradeRate(player, 'gold') !== 1 ? 0.5 : 1
}

/** One player's position from public information; `ownHand` also values the cards in hand. */
function playerValue(s: GameState, p: PlayerId, ownHand: boolean): number {
  const player = s.players[p]
  const stats = computePlayerStats(player)
  let v = computeVP(s, p) * VP_WEIGHT + (s.winner === p ? 1000 : 0)

  // Regions: what they will produce (a full Region risks wasting some of it) and what they hold.
  const doubled = doubledRegions(player)
  const guarded = regionsBorderingCards(player, id => hasEffect(id, 'BRIGAND_PROTECTION'))
  let counted = 0, oreWool = 0
  player.regions.forEach((region, i) => {
    const type = getRegion(region.regionId).resourceType
    const worth = resourceWorth(player, type)
    const production = (doubled.has(i) ? 2 : 1) * worth * PRODUCTION_WEIGHT
    v += region.storedResources === 3 ? production * 0.75 : production
    v += region.storedResources * worth * STORED_WEIGHT
    if (!guarded.has(i)) counted += region.storedResources
    if (type === 'ore' || type === 'wool') oreWool += region.storedResources
  })
  // A Brigand Attack comes up on about a third of the rolls until the next turn.
  if (counted > 7) v -= 0.3 * oreWool * STORED_WEIGHT

  v += stats.strengthPoints * STRENGTH_WEIGHT + stats.commercePoints * COMMERCE_WEIGHT
    + stats.tournamentPoints * TOURNAMENT_WEIGHT + (stats.handLimit - 3) * HAND_LIMIT_WEIGHT
  for (const id of player.playedCards) {
    for (const e of getCard(id).effects) {
      if (e.type === 'IMPROVED_TRADE' || e.type === 'SEARCH_DISCOUNT') v += 1
      if (e.type === 'PLAGUE_PROTECTION' || e.type === 'BRIGAND_PROTECTION') v += 0.5
      if (e.type === 'CIVIL_WAR_PROTECTION') v += 0.3
    }
  }
  if (s.supply.settlement > 0 && s.regionStack.length >= 2 && player.principality.some(x => x.kind === 'empty-settlement')) {
    v += OPEN_SITE_WEIGHT
  }

  v += ownHand
    ? player.hand.reduce((sum, id) => sum + HAND_WEIGHT * cardValue(id, s, p), 0)
    : player.hand.length * OPPONENT_HAND_CARD
  return v
}

function hasFreeSite(player: PlayerState, def: CardDefinition): boolean {
  return player.principality.some(slot =>
    isSettlementLike(slot) && (def.expansionColor !== 'red' || slot.kind === 'city') && slot.expansionSlots.includes(null))
}

function regionsOf(player: PlayerState, type: ResourceType): number {
  return player.regions.filter(r => getRegion(r.regionId).resourceType === type).length
}

/** What a card is worth to `p` (in hand, to keep, take or bury). */
function cardValue(id: string, s: GameState, p: PlayerId): number {
  const def = getCard(id)
  const player = s.players[p]
  if (def.category === 'action') return ACTION_CARD_VALUE[id] ?? 1

  let v = (def.directVP ?? 0) * 6
  const knights = player.playedCards.filter(c => getCard(c).expansionKind === 'knight').length
  const fleets = player.playedCards.filter(c => getCard(c).expansionKind === 'fleet').length
  for (const e of def.effects) {
    switch (e.type) {
      case 'GRANT_SYMBOL':
        v += e.amount * (e.symbol === 'strength' ? STRENGTH_WEIGHT : e.symbol === 'commerce' ? COMMERCE_WEIGHT : TOURNAMENT_WEIGHT)
        break
      case 'INCREASE_HAND_LIMIT': v += HAND_LIMIT_WEIGHT; break
      case 'DOUBLE_PRODUCTION': v += 1 + regionsOf(player, e.resource); break
      case 'BRIGAND_PROTECTION': v += 1.5; break
      case 'STRENGTH_PER_KNIGHT': v += 0.5 + knights * STRENGTH_WEIGHT; break
      case 'COMMERCE_PER_FLEET': v += fleets * COMMERCE_WEIGHT; break
      case 'IMPROVED_TRADE': v += 1 + 0.5 * regionsOf(player, e.resource); break
      case 'SEARCH_DISCOUNT': v += player.playedCards.some(c => hasEffect(c, 'SEARCH_DISCOUNT')) ? 0 : 1; break
      case 'PLAGUE_PROTECTION': v += 0.5; break
      case 'CIVIL_WAR_PROTECTION': v += 0.3; break
    }
  }
  v -= 0.25 * totalOf(def.cost ?? {})
  if (def.expansionColor === 'red' && !player.principality.some(x => x.kind === 'city')) v *= 0.6
  if (!hasFreeSite(player, def)) v *= 0.7
  return Math.max(0.2, v)
}

// ─── Action phase ─────────────────────────────────────────────────────────────

interface Scored { action: GameAction; score: number }

function actionPhase(s: GameState, me: PlayerId): GameAction {
  let best: Scored = { action: { type: 'END_ACTION_PHASE' }, score: evaluate(s, me) + MARGIN }
  const consider = (action: GameAction, score: number | null) => {
    if (score !== null && score > best.score) best = { action, score }
  }
  for (const a of buildMoves(s, me)) consider(a, simulate(s, me, a, false))
  for (const a of exchangeMoves(s, me)) consider(a, simulate(s, me, a, true))
  for (const cardId of ['black-knight', 'arsonist', 'brigands']) consider({ type: 'PLAY_ACTION_CARD', cardId }, attackScore(s, me, cardId))
  consider({ type: 'PLAY_ACTION_CARD', cardId: 'spy' }, spyScore(s, me))
  return best.action
}

/** The score after `action`, or null if the engine refuses it. With `lookahead`, a resource
 *  exchange also counts what it makes possible to build right after. */
function simulate(s: GameState, me: PlayerId, action: GameAction, lookahead: boolean): number | null {
  const next = applyAction(s, me, action)
  if (next === s) return null
  let score = evaluate(next, me)
  if (lookahead) {
    const settled = settleOwnRegions(next, me)
    for (const b of buildMoves(settled, me)) {
      const after = applyAction(settled, me, b)
      if (after !== settled) score = Math.max(score, evaluate(after, me))
    }
  }
  return score
}

/** Make the bot's own Region picks at the head of the queue (they block every other move). */
function settleOwnRegions(s: GameState, me: PlayerId): GameState {
  let x = s
  for (;;) {
    const head = x.pendingChoices[0]
    if (head?.kind !== 'region' || head.player !== me) return x
    const next = applyAction(x, me, { type: 'CHOOSE_REGIONS', regionIndices: regionPicks(x, me, head) })
    if (next === x) return x
    x = next
  }
}

function buildMoves(s: GameState, me: PlayerId): GameAction[] {
  const player = s.players[me]
  const moves: GameAction[] = [{ type: 'BUILD_ROAD', side: 'left' }, { type: 'BUILD_ROAD', side: 'right' }]
  player.principality.forEach((slot, slotIndex) => {
    if (slot.kind === 'empty-settlement') {
      moves.push({ type: 'BUILD_SETTLEMENT', slotIndex })
      if (player.hand.includes('scout')) {
        for (const [above, below] of regionPairs(s.regionStack)) {
          moves.push({ type: 'BUILD_SETTLEMENT', slotIndex, scoutRegionIds: [above, below] })
        }
      }
    }
    if (slot.kind === 'settlement') moves.push({ type: 'BUILD_CITY', slotIndex })
    if (!isSettlementLike(slot)) return
    slot.expansionSlots.forEach((site, expansionSlotIndex) => {
      if (site) return
      for (const cardId of new Set(player.hand)) {
        if (getCard(cardId).category === 'expansion') moves.push({ type: 'PLACE_EXPANSION', cardId, slotIndex, expansionSlotIndex })
      }
    })
  })
  return moves
}

/** Ordered pairs of distinct Regions (by id) from the stack, for a Scout. */
function regionPairs(stack: string[]): [string, string][] {
  const ids = [...new Set(stack)]
  return ids.flatMap(a => ids.filter(b => b !== a).map((b): [string, string] => [a, b]))
}

/** Resource types missing for something the bot could build next. */
function wantedTypes(s: GameState, me: PlayerId): ResourceType[] {
  const player = s.players[me]
  const have = availableResources(player)
  const costs: Partial<Resources>[] = []
  const openSite = player.principality.some(x => x.kind === 'empty-settlement')
  if (s.supply.city > 0 && player.principality.some(x => x.kind === 'settlement')) costs.push(CITY.cost!)
  if (s.supply.settlement > 0 && openSite && s.regionStack.length >= 2) costs.push(SETTLEMENT.cost!)
  if (s.supply.road > 0 && !openSite) costs.push(ROAD.cost!)
  for (const id of player.hand) {
    const def = getCard(id)
    if (def.category === 'expansion' && hasFreeSite(player, def)) costs.push(def.cost ?? {})
  }
  return ALL_RESOURCE_TYPES.filter(r => costs.some(c => have[r] < (c[r] ?? 0)))
}

/** Multisets of 1–2 resource types from `types`. */
function upToTwo(types: ResourceType[]): ResourceType[][] {
  return [...types.map(r => [r]), ...types.flatMap((a, i) => types.slice(i).map(b => [a, b]))]
}

/** Bank trades, Caravan and Merchant: worth it when they lead to a build (simulate with lookahead). */
function exchangeMoves(s: GameState, me: PlayerId): GameAction[] {
  const player = s.players[me]
  const wanted = wantedTypes(s, me)
  if (wanted.length === 0) return []
  const have = availableResources(player)
  const held = ALL_RESOURCE_TYPES.filter(r => have[r] > 0)
  const moves: GameAction[] = []
  for (const give of held) for (const receive of wanted) moves.push({ type: 'TRADE_WITH_BANK', give, receive })
  if (!actionCardsUnlocked(s)) return moves

  if (player.hand.includes('caravan')) {
    for (const give of upToTwo(held)) {
      for (const receive of upToTwo(wanted)) {
        if (receive.length === give.length) moves.push({ type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give, receive } })
      }
    }
  }
  if (player.hand.includes('merchant')) {
    const takeable = stealableTypes(s.players[opponent(me)], player)
    for (const take of upToTwo(takeable)) {
      for (const give of ALL_RESOURCE_TYPES) moves.push({ type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take, give: [give] } })
    }
  }
  return moves
}

/** The state after playing `cardId` from hand, before its effect. */
function withoutCard(s: GameState, me: PlayerId, cardId: string): GameState {
  const player = s.players[me]
  return withPlayer(s, me, { ...player, hand: removeFirst(player.hand, cardId) })
}

/** Black Knight, Arsonist, Brigands: the expected score of the duel. */
function attackScore(s: GameState, me: PlayerId, cardId: string): number | null {
  const opp = opponent(me)
  const player = s.players[me]
  if (!player.hand.includes(cardId) || !actionCardsUnlocked(s) || s.pendingChoices.length > 0) return null
  if (!hasAttackTarget(cardId, player, s.players[opp])) return null

  const countered = s.players[opp].hand.length > 0 ? COUNTER_CHANCE : 0
  const pWin = (1 - countered) * (5 / 6) + countered * (2 / 6)
  const played = withoutCard(s, me, cardId)
  const win = bestOutcome(played, me, me, opp, cardId)
  const lose = bestOutcome(played, me, opp, me, cardId)
  return pWin * win + (1 - pWin) * lose
}

/** The bot's score after `winner` takes the spoils from `loser`, each side choosing for itself. */
function bestOutcome(s: GameState, me: PlayerId, winner: PlayerId, loser: PlayerId, cardId: string): number {
  const outcomes: GameState[] = []
  if (cardId === 'brigands') {
    let x = s
    for (let i = 0; i < 2; i++) {
      const types = stealableTypes(x.players[loser], x.players[winner])
      if (types.length === 0) break
      const steals = types.map(r => {
        const robbed = withPlayer(x, loser, spendFromRegions(x.players[loser], { [r]: 1 }))
        return withPlayer(robbed, winner, addToRegions(x.players[winner], { [r]: 1 }))
      })
      x = pickBest(steals, me, winner === me)
    }
    outcomes.push(x)
  } else {
    const kind = cardId === 'arsonist' ? 'building' : 'knight'
    s.players[loser].principality.forEach((slot, slotIndex) => slot.expansionSlots.forEach((id, expansionSlotIndex) => {
      if (id && getCard(id).expansionKind === kind) {
        outcomes.push(withPlayer(s, loser, returnToHand(s.players[loser], slotIndex, expansionSlotIndex)))
      }
    }))
    if (outcomes.length === 0) outcomes.push(s)
  }
  return evaluate(pickBest(outcomes, me, winner === me), me)
}

/** The outcome the bot likes best (`mine`) or least (the opponent chooses). */
function pickBest(states: GameState[], me: PlayerId, mine: boolean): GameState {
  const scored = states.map(x => ({ x, v: evaluate(x, me) }))
  scored.sort((a, b) => (mine ? b.v - a.v : a.v - b.v))
  return scored[0].x
}

function spyScore(s: GameState, me: PlayerId): number | null {
  if (!s.players[me].hand.includes('spy') || !actionCardsUnlocked(s) || s.pendingChoices.length > 0) return null
  const oppHand = s.players[opponent(me)].hand.length
  if (oppHand === 0) return null
  return evaluate(withoutCard(s, me, 'spy'), me) + 1.2
}

// ─── Roll phase ───────────────────────────────────────────────────────────────

/** Play an Alchemist when the best Production Die result beats an average roll by enough. */
function rollPhase(s: GameState, me: PlayerId): GameAction {
  if (s.players[me].hand.includes('alchemist') && actionCardsUnlocked(s) && s.alchemistNumber === null) {
    const scores = ([1, 2, 3, 4, 5, 6] as ProductionNumber[]).map(n => evaluate(mapPlayers(s, p => produceForPlayer(p, n)), me))
    const average = scores.reduce((a, b) => a + b, 0) / 6
    const best = Math.max(...scores)
    if (best - average > HAND_WEIGHT * cardValue('alchemist', s, me) + MARGIN) {
      const productionNumber = (scores.indexOf(best) + 1) as ProductionNumber
      return { type: 'PLAY_ACTION_CARD', cardId: 'alchemist', params: { productionNumber } }
    }
  }
  return { type: 'ROLL_DICE' }
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function answerChoice(s: GameState, me: PlayerId, head: PendingChoice): GameAction {
  switch (head.kind) {
    case 'resource':
      return bestOf(s, me, head.options.map((resource): GameAction => ({ type: 'CHOOSE_RESOURCE', resource })))
    case 'placedCard':
      return bestOf(s, me, head.options.map((site): GameAction => ({ type: 'CHOOSE_PLACED_CARD', ...site })))
    case 'region':
      return { type: 'CHOOSE_REGIONS', regionIndices: regionPicks(s, me, head) }
    case 'discard':
      return { type: 'DISCARD_TO_LIMIT', discards: discardsFor(s, me) }
    case 'counter':
      return { type: 'ANSWER_ATTACK', playCounter: s.players[me].hand.includes(COUNTER_CARD[head.attackCardId]) }
    case 'attackRoll':
      return { type: 'ROLL_ATTACK' }
    case 'handCard': {
      // The opponent's hand is revealed to the bot while it picks.
      const hand = s.players[head.owner].hand
      if (head.reason === 'spy') {
        const targets = byValue(hand.filter(isSpyTarget), s, me)
        return { type: 'CHOOSE_HAND_CARDS', cardIds: targets.slice(0, 1) }
      }
      return { type: 'CHOOSE_HAND_CARDS', cardIds: byValue(hand, s, head.owner).slice(0, 2), toDeck: largestStack(s) }
    }
    case 'masterBuilder':
      return { type: 'SEARCH_STACK', deck: largestStack(s, d => d !== head.excludeDeck) }
  }
}

/** The candidate with the best score (the first one if the engine refuses them all). */
function bestOf(s: GameState, me: PlayerId, actions: GameAction[]): GameAction {
  let best: Scored = { action: actions[0], score: -Infinity }
  for (const action of actions) {
    const score = simulate(s, me, action, false)
    if (score !== null && score > best.score) best = { action, score }
  }
  return best.action
}

/** Where resources go to (gain) or come from (loss): a gain where there is room, preferably
 *  next to a Garrison and not on a doubled Region (it fills up fastest); a loss from the
 *  fullest Region, preferably one the Brigands would count. */
function regionPicks(s: GameState, me: PlayerId, choice: PendingRegionChoice): number[] {
  const player = s.players[me]
  const stored = [...choice.before]
  const guarded = regionsBorderingCards(player, id => hasEffect(id, 'BRIGAND_PROTECTION'))
  const doubled = doubledRegions(player)
  const picks: number[] = []
  for (const [type, n] of Object.entries(choice.changes) as [ResourceType, number][]) {
    for (let k = 0; k < Math.abs(n); k++) {
      let best = -1, bestScore = -Infinity
      stored.forEach((v, i) => {
        if (getRegion(player.regions[i].regionId).resourceType !== type || (n > 0 ? v >= 3 : v <= 0)) return
        const score = n > 0
          ? (3 - v) + (guarded.has(i) ? 1.5 : 0) - (doubled.has(i) ? 0.5 : 0)
          : v + (guarded.has(i) ? 0 : 0.5) + (doubled.has(i) ? 0.5 : 0)
        if (score > bestScore) { best = i; bestScore = score }
      })
      stored[best] += Math.sign(n)
      picks.push(best)
    }
  }
  return picks
}

/** Cards in descending value for `p`. */
function byValue(cards: string[], s: GameState, p: PlayerId): string[] {
  return [...cards].sort((a, b) => cardValue(b, s, p) - cardValue(a, s, p))
}

function largestStack(s: GameState, allowed: (d: DrawStackId) => boolean = () => true): DrawStackId {
  const options = DRAW_STACK_IDS.filter(d => allowed(d) && s.decks[d].length > 0)
  return options.reduce((a, b) => (s.decks[b].length > s.decks[a].length ? b : a), options[0] ?? DRAW_STACK_IDS[0])
}

/** The least valuable cards above the hand limit, under the largest stack. */
function discardsFor(s: GameState, me: PlayerId): { cardId: string; toDeck: DrawStackId }[] {
  const player = s.players[me]
  const excess = player.hand.length - computePlayerStats(player).handLimit
  const toDeck = largestStack(s)
  return byValue(player.hand, s, me).reverse().slice(0, Math.max(0, excess)).map(cardId => ({ cardId, toDeck }))
}

function answerTrade(s: GameState, me: PlayerId): GameAction {
  const accepted = applyAction(s, me, { type: 'ACCEPT_TRADE' })
  const gain = accepted === s ? -Infinity : evaluate(accepted, me) - evaluate(s, me)
  return gain > TRADE_MARGIN ? { type: 'ACCEPT_TRADE' } : { type: 'DECLINE_TRADE' }
}

// ─── Searching, drawing, exchanging ───────────────────────────────────────────

/** The bot is searching this stack, so it may look at it. */
function takeFromSearch(s: GameState, me: PlayerId): GameAction {
  const search = s.search!
  const contents = byValue(s.decks[search.deck], s, me)
  if (search.purpose === 'setup') return { type: 'TAKE_FROM_SEARCH', cardIds: contents.slice(0, 3) }
  if (search.purpose !== 'masterBuilder') return { type: 'TAKE_FROM_SEARCH', cardIds: contents.slice(0, 1) }

  const hand = byValue(s.players[me].hand, s, me)
  const worst = hand[hand.length - 1]
  const best = contents[0]
  if (!worst || !best || cardValue(best, s, me) <= cardValue(worst, s, me) + 0.3) return { type: 'TAKE_FROM_SEARCH', cardIds: [] }
  return { type: 'TAKE_FROM_SEARCH', cardIds: [best], giveBack: { cardId: worst, toDeck: largestStack(s) } }
}

/** Pay a Search when there are resources to spare: the most plentiful ones first. */
function searchPayment(s: GameState, me: PlayerId): ResourceType[] | null {
  const player = s.players[me]
  const have = availableResources(player)
  if (totalOf(have) < 6) return null
  const pay: ResourceType[] = []
  for (let i = 0; i < searchCost(player); i++) {
    const r = ALL_RESOURCE_TYPES.reduce((a, b) => (have[b] * resourceWorth(player, a) > have[a] * resourceWorth(player, b) ? b : a))
    pay.push(r)
    have[r]--
  }
  return pay
}

function drawPhase(s: GameState, me: PlayerId): GameAction {
  const player = s.players[me]
  if (player.hand.length > computePlayerStats(player).handLimit) return { type: 'DISCARD_TO_LIMIT', discards: discardsFor(s, me) }
  const deck = largestStack(s)
  const payWith = searchPayment(s, me)
  return payWith ? { type: 'SEARCH_STACK', deck, payWith } : { type: 'DRAW_CARD', fromDeck: deck }
}

/** Swap the weakest hand card if it is worth little. */
function exchangePhase(s: GameState, me: PlayerId): GameAction {
  const hand = byValue(s.players[me].hand, s, me)
  const worst = hand[hand.length - 1]
  if (!worst || cardValue(worst, s, me) >= 1) return { type: 'SKIP_EXCHANGE' }
  return { type: 'EXCHANGE', cardId: worst, deck: largestStack(s), payWith: searchPayment(s, me) ?? undefined }
}
