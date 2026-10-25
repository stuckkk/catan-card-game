import { describe, it, expect } from 'vitest'
import { applyAction, applyRoll, resolveAttackRoll, projectStateFor, tokenHolders } from './engine'
import { ALL_DRAW_CARDS, DEFAULT_EVENT_DECK } from './cards'
import { emptyDecks, regionsWith, settlementA, road, settlementB, playedFor, makePlayer, makeState, unlocked, res, roll } from './testing/fixtures'
import type { GameAction, GameState, PlayerState, PlayerId, ResourceType, DrawStackId, CentralSlot } from './types'

// ─── Action Cards ────────────────────────────────────────────────────────────

describe('action cards', () => {
  it('are locked until both players together have 7 VP', () => {
    const host = makePlayer('host', { hand: ['caravan'], regions: regionsWith({ ore: 2 }) })
    const s = makeState({ players: { host, guest: makePlayer('guest') } })  // 2 + 2 VP
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['ore'], receive: ['wool'] } })).toBe(s)
  })

  it('Caravan trades up to 2 resources for 2 others and is discarded', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['caravan'], regions: regionsWith({ lumber: 3 }) }
    const s = applyAction({ ...base, players: { ...base.players, host } }, 'host',
      { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['lumber', 'lumber'], receive: ['ore', 'grain'] } })
    expect(res(s.players.host)).toMatchObject({ lumber: 1, ore: 1, grain: 1 })
    expect(s.players.host.hand).toEqual([])
    expect(s.discardPile).toEqual(['caravan'])
  })

  it('Caravan rejects more than 2 or unaffordable resources', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['caravan'], regions: regionsWith({ lumber: 1 }) }
    const s = { ...base, players: { ...base.players, host } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['lumber', 'lumber'], receive: ['ore', 'ore'] } })).toBe(s)
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'caravan', params: { give: ['lumber'], receive: ['ore', 'ore'] } })).toBe(s)
  })

  it('Merchant takes 2 from the opponent and gives 1 back', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['merchant'], regions: regionsWith({ ore: 1 }) }
    const guest = { ...base.players.guest, regions: regionsWith({ ore: 2, wool: 1 }) }
    const s = { ...base, players: { host, guest } }
    // The give must be something the host holds after taking — wool is not.
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore', 'ore'], give: ['wool'] } })).toBe(s)
    const ok = applyAction(s, 'host',
      { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore', 'wool'], give: ['ore'] } })
    expect(res(ok.players.host)).toMatchObject({ ore: 1, wool: 1 })
    expect(res(ok.players.guest)).toMatchObject({ ore: 2, wool: 0 })
  })

  it('Merchant needs room on the taker’s regions', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['merchant'], regions: regionsWith({ ore: 3 }) }
    const guest = { ...base.players.guest, regions: regionsWith({ ore: 2 }) }
    const s = { ...base, players: { host, guest } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore'], give: ['ore'] } })).toBe(s)
  })

  it('Merchant needs room on the opponent’s regions for the resource given back', () => {
    const base = unlocked()
    const host = { ...base.players.host, hand: ['merchant'], regions: regionsWith({ wool: 1 }) }
    const guest = { ...base.players.guest, regions: regionsWith({ wool: 3, ore: 2 }) }
    const s = { ...base, players: { host, guest } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['ore'], give: ['wool'] } })).toBe(s)
    // Room freed by the take counts.
    const ok = applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'merchant', params: { take: ['wool'], give: ['wool'] } })
    expect(ok).not.toBe(s)
    expect(res(ok.players.guest).wool).toBe(3)
  })

  it('Alchemist is played before the roll and fixes the Production Die', () => {
    const base = unlocked({ phase: 'roll' })
    const s0 = { ...base, players: { ...base.players, host: { ...base.players.host, hand: ['alchemist'] } } }
    const s1 = applyAction(s0, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'alchemist', params: { productionNumber: 5 } })
    expect(s1.alchemistNumber).toBe(5)
    const s2 = applyRoll(s1, roll('tournament', 2))
    expect(s2.lastRoll?.productionNumber).toBe(5)
    expect(s2.alchemistNumber).toBeNull()
    expect(res(s2.players.host).brick).toBe(1)  // hills-5
  })

  it('Alchemist cannot be played after the roll', () => {
    const base = unlocked()
    const s = { ...base, players: { ...base.players, host: { ...base.players.host, hand: ['alchemist'] } } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'alchemist', params: { productionNumber: 5 } })).toBe(s)
  })

  it('Scout cannot be played on its own', () => {
    const base = unlocked()
    const s = { ...base, players: { ...base.players, host: { ...base.players.host, hand: ['scout'] } } }
    expect(applyAction(s, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'scout' })).toBe(s)
  })
})

// ─── Attacks ─────────────────────────────────────────────────────────────────

/** Two Cities each (8 VP together, so Action Cards are unlocked). */
const cities = (a: (string | null)[] = [], b: (string | null)[] = []) => {
  const four = (x: (string | null)[]) => [...x, null, null, null, null].slice(0, 4)
  return [settlementA(four(a)), road(), settlementB(four(b))]
}
const player = (id: PlayerId, board: CentralSlot[], over: Partial<PlayerState> = {}) =>
  makePlayer(id, { principality: board, playedCards: playedFor(board), ...over })
const site = (slotIndex: number, expansionSlotIndex: number) => ({ slotIndex, expansionSlotIndex })
const answer = (playCounter: boolean) => ({ type: 'ANSWER_ATTACK', playCounter }) as const

describe('Black Knight and Herb Woman', () => {
  const duel = (host: PlayerState, guest: PlayerState, over: Partial<GameState> = {}) =>
    makeState({ players: { host: { ...host, hand: ['black-knight', ...host.hand] }, guest }, ...over })
  const play = { type: 'PLAY_ACTION_CARD', cardId: 'black-knight' } as const
  /** Played and answered: the attacker is about to roll. */
  const toRoll = (host: PlayerState, guest: PlayerState, playCounter = false, over: Partial<GameState> = {}) =>
    applyAction(applyAction(duel(host, guest, over), 'host', play), 'guest', answer(playCounter))

  it('is in the decks: 3 Black Knights and 2 Herb Women', () => {
    expect(ALL_DRAW_CARDS.filter(c => c === 'black-knight')).toHaveLength(3)
    expect(ALL_DRAW_CARDS.filter(c => c === 'herb-woman')).toHaveLength(2)
  })

  it('needs an opponent with a Knight, 7 VP and the action phase; the Herb Woman is never played alone', () => {
    const noKnight = duel(player('host', cities(['knight-karl'])), player('guest', cities()))
    expect(applyAction(noKnight, 'host', play)).toBe(noKnight)

    const small = [settlementA(), road(), settlementB()]
    const locked = duel(player('host', small), player('guest', [settlementA(['knight-karl', null]), road(), settlementB()]))
    expect(applyAction(locked, 'host', play)).toBe(locked)

    const rollPhase = duel(player('host', cities()), player('guest', cities(['knight-karl'])), { phase: 'roll' })
    expect(applyAction(rollPhase, 'host', play)).toBe(rollPhase)

    const herb = makeState({ players: { host: player('host', cities(), { hand: ['herb-woman'] }), guest: player('guest', cities(['knight-karl'])) } })
    expect(applyAction(herb, 'host', { type: 'PLAY_ACTION_CARD', cardId: 'herb-woman' })).toBe(herb)
  })

  it('asks the defender first, then the attacker rolls; meanwhile the attacker can do nothing else', () => {
    const host = player('host', cities(), { regions: regionsWith({ lumber: 1, brick: 2 }) })
    let s = applyAction(duel(host, player('guest', cities(['knight-karl']))), 'host', play)
    expect(s.players.host.hand).toEqual([])
    expect(s.discardPile).toEqual(['black-knight'])
    expect(s.pendingChoices).toEqual([{ kind: 'counter', player: 'guest', attacker: 'host', attackCardId: 'black-knight' }])
    for (const a of [{ type: 'ROLL_ATTACK' }, { type: 'END_ACTION_PHASE' }, { type: 'BUILD_ROAD', side: 'right' }, answer(false)] as const) {
      expect(applyAction(s, 'host', a)).toBe(s)
    }
    expect(applyAction(s, 'guest', { type: 'ROLL_ATTACK' })).toBe(s)

    s = applyAction(s, 'guest', answer(false))
    expect(s.pendingChoices).toEqual([{ kind: 'attackRoll', player: 'host', defender: 'guest', attackCardId: 'black-knight', countered: false }])
    expect(applyAction(s, 'guest', { type: 'ROLL_ATTACK' })).toBe(s)
    expect(applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'right' })).toBe(s)

    const rolled = applyAction(s, 'host', { type: 'ROLL_ATTACK' })
    expect(rolled.pendingChoices).toEqual([])
    expect(rolled.eventLog.find(e => e.type === 'attack-roll')?.player).toBe('host')
    expect(applyAction(rolled, 'host', { type: 'BUILD_ROAD', side: 'right' })).not.toBe(rolled)
  })

  it('plays the Herb Woman only from the defender’s hand and discards it', () => {
    const host = player('host', cities())
    const without = applyAction(duel(host, player('guest', cities(['knight-karl']))), 'host', play)
    expect(applyAction(without, 'guest', answer(true))).toBe(without)

    const s = toRoll(host, player('guest', cities(['knight-karl']), { hand: ['herb-woman', 'abbey'] }), true)
    expect(s.players.guest.hand).toEqual(['abbey'])
    expect(s.discardPile).toEqual(['black-knight', 'herb-woman'])
    expect(s.pendingChoices[0]).toMatchObject({ kind: 'attackRoll', countered: true })
  })

  it('lets the attacker win on 1–5 (1–2 against the Herb Woman); the winner picks the loser’s Knight', () => {
    const host = player('host', cities(['knight-otto'], ['knight-hagen']))
    const guest = player('guest', cities(['knight-karl'], ['knight-conrad']), { hand: ['herb-woman'] })
    const attackerPicks = { kind: 'placedCard', player: 'host', owner: 'guest', reason: 'blackKnight', options: [site(0, 0), site(2, 0)] }
    const defenderPicks = { kind: 'placedCard', player: 'guest', owner: 'host', reason: 'blackKnight', options: [site(0, 0), site(2, 0)] }

    const plain = toRoll(host, guest)
    expect(resolveAttackRoll(plain, 5).pendingChoices).toEqual([attackerPicks, { kind: 'discard', player: 'guest' }])
    expect(resolveAttackRoll(plain, 6).pendingChoices).toEqual([defenderPicks])
    const countered = toRoll(host, guest, true)
    expect(resolveAttackRoll(countered, 2).pendingChoices).toEqual([attackerPicks, { kind: 'discard', player: 'guest' }])
    expect(resolveAttackRoll(countered, 3).pendingChoices).toEqual([defenderPicks])

    const s = resolveAttackRoll(countered, 3)
    expect(s.eventLog.slice(-1)[0]).toMatchObject({ player: 'host', type: 'attack-roll', payload: { cardId: 'black-knight', die: 3, countered: true, attackerWins: false } })
    expect(applyAction(s, 'host', { type: 'CHOOSE_PLACED_CARD', ...site(0, 0) })).toBe(s)
    const after = applyAction(s, 'guest', { type: 'CHOOSE_PLACED_CARD', ...site(2, 0) })
    expect(after.players.host.hand).toEqual(['knight-hagen'])
    expect(after.players.host.playedCards).not.toContain('knight-hagen')
    expect(after.pendingChoices).toEqual([])
    expect(after.phase).toBe('action')
  })

  it('returns the only Knight without asking, and does nothing when the loser has no Knight', () => {
    const guest = player('guest', cities(['knight-karl']))
    const won = resolveAttackRoll(toRoll(player('host', cities()), guest), 1)
    expect(won.players.guest.hand).toEqual(['knight-karl'])
    expect(won.players.guest.principality[0].expansionSlots).toEqual([null, null, null, null])
    expect(won.pendingChoices).toEqual([])
    expect(won.eventLog.slice(-1)[0]).toMatchObject({ player: 'guest', type: 'returned-to-hand', payload: { cardId: 'knight-karl', reason: 'blackKnight' } })

    const s = toRoll(player('host', cities()), guest)
    const lost = resolveAttackRoll(s, 6)
    expect(lost.players).toEqual(s.players)
    expect(lost.pendingChoices).toEqual([])
    expect(lost.phase).toBe('action')
  })

  it('can hit a Knight in a City with a Church', () => {
    const s = resolveAttackRoll(toRoll(player('host', cities()), player('guest', cities(['church', 'knight-karl']))), 1)
    expect(s.players.guest.hand).toEqual(['knight-karl'])
  })

  it('makes a defender over the limit discard right away; then the attacker’s turn goes on', () => {
    const guest = player('guest', cities(['knight-karl']), { hand: ['abbey', 'smithy', 'mint'] })
    let s = resolveAttackRoll(toRoll(player('host', cities()), guest, false, { decks: { ...emptyDecks(), 'stack-4': ['library'] } }), 4)
    expect(s.players.guest.hand).toEqual(['abbey', 'smithy', 'mint', 'knight-karl'])
    expect(s.pendingChoices).toEqual([{ kind: 'discard', player: 'guest' }])
    expect(applyAction(s, 'host', { type: 'END_ACTION_PHASE' })).toBe(s)

    s = applyAction(s, 'guest', { type: 'DISCARD_TO_LIMIT', discards: [{ cardId: 'smithy', toDeck: 'stack-4' }] })
    expect(s.players.guest.hand).toEqual(['abbey', 'mint', 'knight-karl'])
    expect(s.decks['stack-4']).toEqual(['smithy', 'library'])
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(applyAction(s, 'host', { type: 'END_ACTION_PHASE' }).phase).toBe('draw')  // the host's hand is empty
  })

  it('leaves an attacker over the limit to the end-of-turn check', () => {
    const host = player('host', cities(['knight-conrad']), { hand: ['abbey', 'smithy', 'mint'] })
    const s = resolveAttackRoll(toRoll(host, player('guest', cities(['knight-karl']))), 6)
    expect(s.players.host.hand).toEqual(['abbey', 'smithy', 'mint', 'knight-conrad'])
    expect(s.pendingChoices).toEqual([])
    expect(applyAction(s, 'host', { type: 'END_ACTION_PHASE' }).phase).toBe('draw')
  })

  it('moves the Knight Token', () => {
    const s = toRoll(player('host', cities(['knight-conrad'])), player('guest', cities(['knight-karl'])))
    expect(tokenHolders(s).knight).toBe('guest')
    expect(tokenHolders(resolveAttackRoll(s, 2)).knight).toBe('host')
  })
})

describe('Arsonist, Brigands and Bishop', () => {
  /** The host holds `cardId` and attacks the guest. */
  const attack = (cardId: string, host: PlayerState, guest: PlayerState) =>
    makeState({ players: { host: { ...host, hand: [cardId, ...host.hand] }, guest } })
  const play = (cardId: string) => ({ type: 'PLAY_ACTION_CARD', cardId }) as const
  /** Played and answered: the attacker is about to roll. */
  const toRoll = (cardId: string, host: PlayerState, guest: PlayerState, playCounter = false) =>
    applyAction(applyAction(attack(cardId, host, guest), 'host', play(cardId)), 'guest', answer(playCounter))
  const choose = (resource: ResourceType) => ({ type: 'CHOOSE_RESOURCE', resource }) as const

  it('is in the decks: 2 Arsonists, 2 Bishops, 1 Brigands', () => {
    expect(ALL_DRAW_CARDS.filter(c => c === 'arsonist')).toHaveLength(2)
    expect(ALL_DRAW_CARDS.filter(c => c === 'bishop')).toHaveLength(2)
    expect(ALL_DRAW_CARDS.filter(c => c === 'brigands')).toHaveLength(1)
  })

  it('Arsonist needs an opponent with a Building (Knights and Fleets are not) and 7 VP', () => {
    const unitsOnly = attack('arsonist', player('host', cities(['abbey'])), player('guest', cities(['knight-karl'], ['fleet-ore'])))
    expect(applyAction(unitsOnly, 'host', play('arsonist'))).toBe(unitsOnly)

    const small = [settlementA(), road(), settlementB()]
    const locked = attack('arsonist', player('host', small), player('guest', [settlementA(['abbey', null]), road(), settlementB()]))
    expect(applyAction(locked, 'host', play('arsonist'))).toBe(locked)

    const ok = attack('arsonist', player('host', cities()), player('guest', cities(['abbey'])))
    expect(applyAction(ok, 'host', play('arsonist')).pendingChoices)
      .toEqual([{ kind: 'counter', player: 'guest', attacker: 'host', attackCardId: 'arsonist' }])
  })

  it('Brigands needs a resource of the opponent that the attacker has room for', () => {
    const host = player('host', cities(), { regions: regionsWith({ wool: 3 }) })
    const full = attack('brigands', host, player('guest', cities(), { regions: regionsWith({ wool: 2 }) }))
    expect(applyAction(full, 'host', play('brigands'))).toBe(full)
    const broke = attack('brigands', player('host', cities()), player('guest', cities()))
    expect(applyAction(broke, 'host', play('brigands'))).toBe(broke)
    const ok = attack('brigands', host, player('guest', cities(), { regions: regionsWith({ wool: 2, ore: 1 }) }))
    expect(applyAction(ok, 'host', play('brigands')).pendingChoices[0]).toMatchObject({ kind: 'counter', attackCardId: 'brigands' })
  })

  it('the Bishop counters only the Arsonist and Brigands, and is never played alone', () => {
    const guest = player('guest', cities(['abbey', 'knight-karl']), { hand: ['bishop', 'herb-woman'] })
    const arson = toRoll('arsonist', player('host', cities()), guest, true)
    expect(arson.players.guest.hand).toEqual(['herb-woman'])
    expect(arson.discardPile).toEqual(['arsonist', 'bishop'])
    expect(arson.pendingChoices[0]).toMatchObject({ kind: 'attackRoll', countered: true })
    expect(toRoll('black-knight', player('host', cities()), guest, true).players.guest.hand).toEqual(['bishop'])

    const herbOnly = applyAction(attack('arsonist', player('host', cities()), player('guest', cities(['abbey']), { hand: ['herb-woman'] })), 'host', play('arsonist'))
    expect(applyAction(herbOnly, 'guest', answer(true))).toBe(herbOnly)

    const alone = makeState({ players: { host: player('host', cities(), { hand: ['bishop'] }), guest: player('guest', cities(['abbey'])) } })
    expect(applyAction(alone, 'host', play('bishop'))).toBe(alone)
  })

  it('Arsonist: the winner picks a Building of the loser (a Church too) on 1–5, or 1–2 against the Bishop', () => {
    const host = player('host', cities(['abbey'], ['smithy']))
    const guest = player('guest', cities(['church', 'knight-karl', 'fleet-ore', 'library']), { hand: ['bishop'] })
    const attackerPicks = { kind: 'placedCard', player: 'host', owner: 'guest', reason: 'arsonist', options: [site(0, 0), site(0, 3)] }
    const defenderPicks = { kind: 'placedCard', player: 'guest', owner: 'host', reason: 'arsonist', options: [site(0, 0), site(2, 0)] }
    const discard = { kind: 'discard', player: 'guest' }

    const plain = toRoll('arsonist', host, guest)
    expect(resolveAttackRoll(plain, 5).pendingChoices).toEqual([attackerPicks, discard])
    expect(resolveAttackRoll(plain, 6).pendingChoices).toEqual([defenderPicks])
    const countered = toRoll('arsonist', host, guest, true)
    expect(resolveAttackRoll(countered, 2).pendingChoices).toEqual([attackerPicks, discard])
    expect(resolveAttackRoll(countered, 3).pendingChoices).toEqual([defenderPicks])

    const after = applyAction(resolveAttackRoll(plain, 1), 'host', { type: 'CHOOSE_PLACED_CARD', ...site(0, 0) })
    expect(after.players.guest.hand).toEqual(['bishop', 'church'])
    expect(after.eventLog.slice(-1)[0]).toMatchObject({ player: 'guest', type: 'returned-to-hand', payload: { cardId: 'church', reason: 'arsonist' } })
    expect(after.pendingChoices).toEqual([])
    expect(after.phase).toBe('action')
  })

  it('Arsonist: a single Building returns without asking; a losing attacker without one loses nothing', () => {
    const s = toRoll('arsonist', player('host', cities(['knight-conrad'])), player('guest', cities(['abbey'])))
    const won = resolveAttackRoll(s, 3)
    expect(won.players.guest.hand).toEqual(['abbey'])
    expect(won.pendingChoices).toEqual([])

    const lost = resolveAttackRoll(s, 6)
    expect(lost.players).toEqual(s.players)
    expect(lost.pendingChoices).toEqual([])
    expect(lost.phase).toBe('action')
  })

  it('Arsonist: a defender who loses a Library discards right away; an attacker waits for the end of the turn', () => {
    const guest = player('guest', cities(['library']), { hand: ['abbey', 'smithy', 'mint', 'church'] })
    let s = resolveAttackRoll(toRoll('arsonist', player('host', cities()), guest), 4)
    expect(s.players.guest.hand).toEqual(['abbey', 'smithy', 'mint', 'church', 'library'])
    expect(s.pendingChoices).toEqual([{ kind: 'discard', player: 'guest' }])
    s = applyAction(s, 'guest', { type: 'DISCARD_TO_LIMIT', discards: [{ cardId: 'smithy', toDeck: 'stack-1' }, { cardId: 'mint', toDeck: 'stack-2' }] })
    expect(s.players.guest.hand).toEqual(['abbey', 'church', 'library'])
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')

    const host = player('host', cities(['library']), { hand: ['abbey', 'smithy', 'mint'] })
    const lost = resolveAttackRoll(toRoll('arsonist', host, player('guest', cities(['abbey']))), 6)
    expect(lost.players.host.hand).toEqual(['abbey', 'smithy', 'mint', 'library'])
    expect(lost.pendingChoices).toEqual([])
  })

  it('Brigands: the winner steals 2, one pick at a time, only what they have room for', () => {
    const host = player('host', cities(), { regions: regionsWith({ wool: 3, ore: 2 }) })
    const guest = player('guest', cities(), { regions: regionsWith({ wool: 2, ore: 3, lumber: 1 }) })
    let s = resolveAttackRoll(toRoll('brigands', host, guest), 5)
    expect(s.pendingChoices[0]).toEqual({ kind: 'resource', player: 'host', reason: 'brigands', options: ['lumber', 'ore'], takeFrom: 'guest' })
    expect(applyAction(s, 'host', choose('wool'))).toBe(s)

    s = applyAction(s, 'host', choose('ore'))
    expect(s.pendingChoices[0]).toMatchObject({ kind: 'resource', player: 'host', options: ['lumber'] })  // ore is full now
    s = applyAction(s, 'host', choose('lumber'))
    expect(res(s.players.host)).toMatchObject({ wool: 3, ore: 3, lumber: 1 })
    expect(res(s.players.guest)).toMatchObject({ wool: 2, ore: 2, lumber: 0 })
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(s.eventLog.slice(-1)[0]).toMatchObject({ player: 'host', type: 'CHOOSE_RESOURCE', payload: { resource: 'lumber', reason: 'brigands' } })
  })

  it('Brigands: the same type may be stolen twice; with 1 resource there is 1 pick', () => {
    const twiceFrom = player('guest', cities(), { regions: regionsWith({ grain: 2 }) })
    const s = resolveAttackRoll(toRoll('brigands', player('host', cities()), twiceFrom), 1)
    const twice = applyAction(applyAction(s, 'host', choose('grain')), 'host', choose('grain'))
    expect(res(twice.players.host).grain).toBe(2)
    expect(res(twice.players.guest).grain).toBe(0)
    expect(twice.pendingChoices).toEqual([])

    const oneFrom = player('guest', cities(), { regions: regionsWith({ grain: 1 }) })
    const one = applyAction(resolveAttackRoll(toRoll('brigands', player('host', cities()), oneFrom), 1), 'host', choose('grain'))
    expect(one.pendingChoices).toEqual([])
    expect(one.phase).toBe('action')
  })

  it('Brigands: on a 6 the defender steals from the attacker; with nothing to steal the turn goes on', () => {
    const host = player('host', cities(), { regions: regionsWith({ brick: 2 }) })
    const guest = player('guest', cities(), { regions: regionsWith({ ore: 1 }), hand: ['bishop'] })
    let s = resolveAttackRoll(toRoll('brigands', host, guest, true), 3)
    expect(s.pendingChoices).toHaveLength(2)
    expect(s.pendingChoices[0]).toEqual({ kind: 'resource', player: 'guest', reason: 'brigands', options: ['brick'], takeFrom: 'host' })
    expect(applyAction(s, 'host', choose('brick'))).toBe(s)
    s = applyAction(applyAction(s, 'guest', choose('brick')), 'guest', choose('brick'))
    expect(res(s.players.guest).brick).toBe(2)
    expect(res(s.players.host).brick).toBe(0)
    expect(s.pendingChoices).toEqual([])

    const broke = resolveAttackRoll(toRoll('brigands', player('host', cities()), guest), 6)
    expect(broke.pendingChoices).toEqual([])
    expect(broke.phase).toBe('action')
  })
})

describe('Spy and Conflict', () => {
  const spy = { type: 'PLAY_ACTION_CARD', cardId: 'spy' } as const
  const take = (...cardIds: string[]) => ({ type: 'CHOOSE_HAND_CARDS', cardIds }) as const
  const bury = (toDeck: DrawStackId | undefined, ...cardIds: string[]) => ({ type: 'CHOOSE_HAND_CARDS', cardIds, toDeck }) as const
  /** The host (holding a Spy plus `host.hand`) plays it against the guest holding `guestHand`. */
  const spied = (guestHand: string[], host: Partial<PlayerState> = {}) =>
    applyAction(makeState({
      players: {
        host: player('host', cities(), { ...host, hand: ['spy', ...(host.hand ?? [])] }),
        guest: player('guest', cities(), { hand: guestHand }),
      },
    }), 'host', spy)
  /** The host rolls Conflict (production 6: only the Gold Fields produce). */
  const conflict = (host: PlayerState, guest: PlayerState) =>
    applyRoll(makeState({
      phase: 'roll', players: { host, guest }, decks: { ...emptyDecks(), event: ['event-conflict'], 'stack-2': ['library'] },
    }), roll('event', 6))

  it('is in the decks: 3 Spies and 1 Conflict', () => {
    expect(ALL_DRAW_CARDS.filter(c => c === 'spy')).toHaveLength(3)
    expect(DEFAULT_EVENT_DECK.filter(c => c === 'event-conflict')).toHaveLength(1)
  })

  it('Spy: playable from 7 VP, even when the opponent has nothing to take', () => {
    const small = [settlementA(), road(), settlementB()]
    const locked = makeState({ players: { host: player('host', small, { hand: ['spy'] }), guest: player('guest', small, { hand: ['knight-karl'] }) } })
    expect(applyAction(locked, 'host', spy)).toBe(locked)

    const s = spied(['abbey', 'mint'])
    expect(s.players.host.hand).toEqual([])
    expect(s.discardPile).toEqual(['spy'])
    expect(s.pendingChoices).toEqual([{ kind: 'handCard', player: 'host', owner: 'guest', reason: 'spy' }])
  })

  it('Spy: shows the opponent’s whole hand to the attacker only, while the pick is open', () => {
    const s = spied(['abbey', 'knight-karl'])
    expect(projectStateFor(s, 'host').revealedHand).toEqual(['abbey', 'knight-karl'])
    expect(projectStateFor(s, 'host').players.guest.hand).toBe(2)
    expect(projectStateFor(s, 'guest').revealedHand).toBeNull()
    expect(projectStateFor(applyAction(s, 'host', take('knight-karl')), 'host').revealedHand).toBeNull()
  })

  it('Spy: takes 1 Knight, Fleet or Action card into the attacker’s hand, never a Building', () => {
    const guestHand = ['abbey', 'knight-karl', 'fleet-ore', 'herb-woman']
    const s = spied(guestHand, { hand: ['mint'] })
    for (const bad of [take('abbey'), take(), take('knight-karl', 'fleet-ore'), take('knight-conrad')]) {
      expect(applyAction(s, 'host', bad)).toBe(s)
    }
    expect(applyAction(s, 'guest', take('knight-karl'))).toBe(s)
    for (const id of ['knight-karl', 'fleet-ore', 'herb-woman']) {
      const t = applyAction(s, 'host', take(id))
      expect(t.players.host.hand).toEqual(['mint', id])
      expect(t.players.guest.hand).toEqual(guestHand.filter(c => c !== id))
      expect(t.pendingChoices).toEqual([])
    }
  })

  it('Spy: without a Unit or Action card the attacker confirms empty-handed; an empty hand asks nothing', () => {
    const s = spied(['abbey', 'mint'])
    expect(applyAction(s, 'host', take('abbey'))).toBe(s)
    const done = applyAction(s, 'host', take())
    expect(done.players.guest.hand).toEqual(['abbey', 'mint'])
    expect(done.players.host.hand).toEqual([])
    expect(done.pendingChoices).toEqual([])
    expect(spied([]).pendingChoices).toEqual([])
  })

  it('Spy: the attacker is locked until the pick, then may build the stolen Knight at once', () => {
    const s = spied(['knight-conrad'], { regions: regionsWith({ grain: 1, ore: 1 }) })
    const build = { type: 'PLACE_EXPANSION', cardId: 'knight-conrad', slotIndex: 0, expansionSlotIndex: 0 } as const
    expect(applyAction(s, 'host', build)).toBe(s)
    expect(applyAction(s, 'host', { type: 'END_ACTION_PHASE' })).toBe(s)
    const built = applyAction(applyAction(s, 'host', take('knight-conrad')), 'host', build)
    expect(built.players.host.principality[0].expansionSlots[0]).toBe('knight-conrad')
  })

  it('Conflict: without a Knight Token holder nothing happens and production runs', () => {
    const s = conflict(player('host', cities(), { hand: ['abbey'] }), player('guest', cities(), { hand: ['mint', 'smithy'] }))
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(s.players.guest.hand).toEqual(['mint', 'smithy'])
  })

  it('Conflict: the Token holder puts 2 of the opponent’s cards under one stack, then production runs', () => {
    const guestHand = ['mint', 'smithy', 'abbey']
    let s = conflict(player('host', cities(['knight-karl'])), player('guest', cities(), { hand: guestHand }))
    expect(s.phase).toBe('event-resolution')
    expect(s.pendingChoices).toEqual([{ kind: 'handCard', player: 'host', owner: 'guest', reason: 'conflict' }])
    expect(projectStateFor(s, 'host').revealedHand).toEqual(guestHand)
    expect(projectStateFor(s, 'guest').revealedHand).toBeNull()
    const bad = [
      bury('stack-2', 'mint'), bury(undefined, 'mint', 'smithy'), bury('event' as DrawStackId, 'mint', 'smithy'),
      bury('stack-2', 'mint', 'mint'), bury('stack-2', 'mint', 'smithy', 'abbey'),
    ]
    for (const a of bad) expect(applyAction(s, 'host', a)).toBe(s)
    expect(applyAction(s, 'guest', bury('stack-2', 'mint', 'smithy'))).toBe(s)

    s = applyAction(s, 'host', bury('stack-2', 'mint', 'smithy'))
    expect(s.players.guest.hand).toEqual(['abbey'])
    expect(s.decks['stack-2']).toEqual(['mint', 'smithy', 'library'])  // under = bottom = front
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(res(s.players.host).gold).toBe(1)
  })

  it('Conflict: the roller’s opponent may hold the Token; a hand of 1 loses that card and is not refilled yet', () => {
    let s = conflict(player('host', cities(), { hand: ['abbey'] }), player('guest', cities(['knight-karl'])))
    expect(s.pendingChoices).toEqual([{ kind: 'handCard', player: 'guest', owner: 'host', reason: 'conflict' }])
    expect(applyAction(s, 'host', bury('stack-1', 'abbey'))).toBe(s)
    expect(applyAction(s, 'guest', bury('stack-1'))).toBe(s)
    s = applyAction(s, 'guest', bury('stack-1', 'abbey'))
    expect(s.players.host.hand).toEqual([])
    expect(s.decks['stack-1']).toEqual(['abbey'])
    expect(s.phase).toBe('action')

    const empty = conflict(player('host', cities(['knight-karl'])), player('guest', cities()))
    expect(empty.pendingChoices).toEqual([])
    expect(empty.phase).toBe('action')
  })

  it('logs the card the Spy took, and how many cards Conflict put under which stack', () => {
    const spyLog = applyAction(spied(['knight-karl']), 'host', take('knight-karl')).eventLog.find(e => e.type === 'CHOOSE_HAND_CARDS')
    expect(spyLog).toMatchObject({ player: 'host', type: 'CHOOSE_HAND_CARDS', payload: { reason: 'spy', cardId: 'knight-karl' } })
    const s = conflict(player('host', cities(['knight-karl'])), player('guest', cities(), { hand: ['mint', 'smithy'] }))
    const conflictLog = applyAction(s, 'host', bury('stack-2', 'mint', 'smithy')).eventLog.find(e => e.type === 'CHOOSE_HAND_CARDS')
    expect(conflictLog?.payload).toEqual({ reason: 'conflict', count: 2, deck: 'stack-2' })
  })
})

describe('Master Builder', () => {
  const look = (deck: DrawStackId) => ({ type: 'SEARCH_STACK', deck }) as const
  const swap = (cardId: string, giveBack: string, toDeck: DrawStackId) =>
    ({ type: 'TAKE_FROM_SEARCH', cardIds: [cardId], giveBack: { cardId: giveBack, toDeck } }) satisfies GameAction
  const nothing = { type: 'TAKE_FROM_SEARCH', cardIds: [] } satisfies GameAction
  /** The host rolls Master Builder (production 6: only the Gold Fields produce). */
  const built = (stacks: Partial<Record<DrawStackId, string[]>> = { 'stack-1': ['abbey', 'mint'], 'stack-2': ['smithy', 'library'] }) =>
    applyRoll(makeState({
      phase: 'roll',
      players: { host: makePlayer('host', { hand: ['harbor'] }), guest: makePlayer('guest', { hand: ['church', 'spy'] }) },
      decks: { ...emptyDecks(), ...stacks, event: ['event-master-builder'] },
    }), roll('event', 6))

  it('the roller must look through a non-empty stack first; nothing else goes on', () => {
    const s = built()
    expect(s.phase).toBe('event-resolution')
    expect(s.pendingChoices).toEqual([{ kind: 'masterBuilder', player: 'host', excludeDeck: null }])
    expect(applyAction(s, 'host', look('stack-3'))).toBe(s)
    expect(applyAction(s, 'guest', look('stack-1'))).toBe(s)
    expect(applyAction(s, 'host', { type: 'END_ACTION_PHASE' })).toBe(s)
    const open = applyAction(s, 'host', look('stack-1'))
    expect(open.search).toEqual({ player: 'host', deck: 'stack-1', purpose: 'masterBuilder' })
    expect(res(open.players.host)).toEqual(res(s.players.host))  // free
    expect(projectStateFor(open, 'host').searchContents).toEqual(['abbey', 'mint'])
    expect(projectStateFor(open, 'guest').searchContents).toBeNull()
  })

  it('a swap takes 1 card and puts 1 hand card under any stack; the hand size stays', () => {
    const open = applyAction(built(), 'host', look('stack-1'))
    for (const bad of [
      { type: 'TAKE_FROM_SEARCH', cardIds: ['abbey'] },
      { type: 'TAKE_FROM_SEARCH', cardIds: [], giveBack: { cardId: 'harbor', toDeck: 'stack-1' } },
      swap('abbey', 'church', 'stack-2'), swap('abbey', 'harbor', 'event' as DrawStackId), swap('smithy', 'harbor', 'stack-2'),
      { type: 'TAKE_FROM_SEARCH', cardIds: ['abbey', 'mint'], giveBack: { cardId: 'harbor', toDeck: 'stack-2' } },
    ] satisfies GameAction[]) expect(applyAction(open, 'host', bad)).toBe(open)

    const s = applyAction(open, 'host', swap('abbey', 'harbor', 'stack-2'))
    expect(s.players.host.hand).toEqual(['abbey'])
    expect(s.decks['stack-1']).toEqual(['mint'])
    expect(s.decks['stack-2']).toEqual(['harbor', 'smithy', 'library'])
    expect(s.search).toBeNull()
  })

  it('the card given back may be the one just taken; taking nothing changes nothing', () => {
    const open = applyAction(built(), 'host', look('stack-1'))
    const back = applyAction(open, 'host', swap('mint', 'mint', 'stack-1'))
    expect(back.players.host.hand).toEqual(['harbor'])
    expect(back.decks['stack-1']).toEqual(['mint', 'abbey'])
    const none = applyAction(open, 'host', nothing)
    expect(none.players.host.hand).toEqual(['harbor'])
    expect(none.decks).toEqual(open.decks)
  })

  it('then the opponent looks through a different stack, off-turn; production runs after both', () => {
    let s = applyAction(applyAction(built(), 'host', look('stack-1')), 'host', nothing)
    expect(s.pendingChoices).toEqual([{ kind: 'masterBuilder', player: 'guest', excludeDeck: 'stack-1' }])
    expect(s.phase).toBe('event-resolution')
    expect(applyAction(s, 'guest', look('stack-1'))).toBe(s)
    expect(applyAction(s, 'host', look('stack-2'))).toBe(s)
    s = applyAction(s, 'guest', look('stack-2'))
    expect(projectStateFor(s, 'guest').searchContents).toEqual(['smithy', 'library'])
    expect(projectStateFor(s, 'host').searchContents).toBeNull()
    expect(applyAction(s, 'host', nothing)).toBe(s)
    s = applyAction(s, 'guest', swap('library', 'spy', 'stack-5'))
    expect(s.players.guest.hand).toEqual(['church', 'library'])
    expect(s.decks['stack-5']).toEqual(['spy'])
    expect(s.pendingChoices).toEqual([])
    expect(s.phase).toBe('action')
    expect(res(s.players.host).gold).toBe(1)
  })

  it('skips a player without a stack to look through', () => {
    const one = applyAction(applyAction(built({ 'stack-3': ['mint'] }), 'host', look('stack-3')), 'host', nothing)
    expect(one.pendingChoices).toEqual([])
    expect(one.phase).toBe('action')
    const none = built({})
    expect(none.pendingChoices).toEqual([])
    expect(none.phase).toBe('action')
  })

  it('logs the stacks, not the cards', () => {
    const s = applyAction(applyAction(built(), 'host', look('stack-1')), 'host', swap('abbey', 'harbor', 'stack-2'))
    expect(s.eventLog.find(e => e.type === 'SEARCH_STACK')?.payload).toEqual({ deck: 'stack-1', purpose: 'masterBuilder' })
    expect(s.eventLog.find(e => e.type === 'TAKE_FROM_SEARCH')?.payload).toEqual({ deck: 'stack-1', count: 1, purpose: 'masterBuilder', giveBackDeck: 'stack-2' })
  })
})
