import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyAction, computeVP, createInitialState } from './engine'
import { botShouldAct, chooseBotAction } from './bot'
import { getRegion } from './regions'
import { checkInvariants, mulberry32, step } from './testing/randomBot'
import type { GameState, PlayerId, PlayerState, Resources } from './types'

/** A fresh game past setup, in the guest's (the computer's) action phase. */
function midGame(over: Partial<GameState> = {}): GameState {
  const s = createInitialState({ vpTarget: 12, language: 'en' }, mulberry32(1))
  return {
    ...s, phase: 'action', activePlayer: 'guest', turn: 6,
    setup: { firstPlayer: 'host', picked: { host: 'stack-1', guest: 'stack-2' } }, ...over,
  }
}

/** The player's six starting Regions holding exactly these resources. */
function stocked(p: PlayerState, amounts: Partial<Resources>, hand: string[] = []): PlayerState {
  return { ...p, hand, regions: p.regions.map(r => ({ ...r, storedResources: amounts[getRegion(r.regionId).resourceType] ?? 0 })) }
}

/** Play a seeded game: `guest` is the computer opponent, `host` is another bot or the random bot. */
function playGame(seed: number, host: 'bot' | 'random'): GameState {
  const rng = mulberry32(seed)
  vi.spyOn(Math, 'random').mockImplementation(rng)
  let s = createInitialState({ vpTarget: 12, language: 'en' }, rng)
  let steps = 0
  while (!s.winner && s.turn < 300) {
    const bots: PlayerId[] = host === 'bot' ? ['guest', 'host'] : ['guest']
    const p = bots.find(b => botShouldAct(s, b))
    let next: GameState
    if (p) {
      const action = chooseBotAction(s, p)
      expect(action, `bot has no move in phase ${s.phase} (turn ${s.turn})`).not.toBeNull()
      next = applyAction(s, p, action!)
    } else {
      next = step(s, rng)
    }
    expect(next, `no progress in phase ${s.phase} (turn ${s.turn})`).not.toBe(s)
    s = next
    checkInvariants(s)
    if (++steps > 20000) throw new Error('runaway game')
  }
  return s
}

describe('computer opponent', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('builds a City when it can afford one', () => {
    const s = midGame()
    const state = { ...s, players: { ...s.players, guest: stocked(s.players.guest, { ore: 3, grain: 2 }) } }
    expect(chooseBotAction(state, 'guest')).toMatchObject({ type: 'BUILD_CITY' })
  })

  it('plays its counter card when attacked', () => {
    const s = midGame({ activePlayer: 'host' })
    const state: GameState = {
      ...s,
      players: { ...s.players, guest: stocked(s.players.guest, {}, ['herb-woman']) },
      pendingChoices: [{ kind: 'counter', player: 'guest', attacker: 'host', attackCardId: 'black-knight' }],
    }
    expect(chooseBotAction(state, 'guest')).toEqual({ type: 'ANSWER_ATTACK', playCounter: true })
  })

  it('accepts a generous trade offer and declines a bad one', () => {
    const s = midGame({ activePlayer: 'host' })
    const players = { host: stocked(s.players.host, { brick: 2, gold: 1 }), guest: stocked(s.players.guest, { grain: 3, wool: 2 }) }
    const offer = (give: Partial<Resources>, receive: Partial<Resources>): GameState =>
      ({ ...s, players, pendingTrade: { from: 'host', give, receive } })
    expect(chooseBotAction(offer({ brick: 2 }, { wool: 1 }), 'guest')).toEqual({ type: 'ACCEPT_TRADE' })
    expect(chooseBotAction(offer({ gold: 1 }, { grain: 3 }), 'guest')).toEqual({ type: 'DECLINE_TRADE' })
  })

  it('waits while it is not its move', () => {
    expect(chooseBotAction(midGame({ activePlayer: 'host' }), 'guest')).toBeNull()
  })

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('seed %i: bot vs bot plays to a win without getting stuck', seed => {
    const s = playGame(seed, 'bot')
    expect(s.winner).not.toBeNull()
  })

  it('beats the random bot in most games', () => {
    const games = Array.from({ length: 40 }, (_, i) => playGame(100 + i, 'random'))
    const wins = games.filter(s => s.winner === 'guest' || (!s.winner && computeVP(s, 'guest') > computeVP(s, 'host'))).length
    expect(wins).toBeGreaterThanOrEqual(34)
  }, 30_000)
})
