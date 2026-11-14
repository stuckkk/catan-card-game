import { describe, it, expect } from 'vitest'
import { applyAction } from './engine'
import { canUndo } from './undo'
import { makeState, makePlayer, regionsWith, unlocked, emptyDecks } from './testing/fixtures'
import type { GameAction, GameState } from './types'

const rich = (over: Partial<GameState> = {}) => makeState({
  players: { host: makePlayer('host', { regions: regionsWith({ lumber: 3, brick: 3, wool: 3, grain: 1 }) }), guest: makePlayer('guest') },
  decks: { ...emptyDecks(), 'stack-1': ['abbey', 'smithy'] },
  ...over,
})
const undoable = (s: GameState, action: GameAction, player: 'host' | 'guest' = 'host') => {
  const next = applyAction(s, player, action)
  expect(next).not.toBe(s)
  return canUndo(s, next)
}

describe('undo in local games', () => {
  it('may take back a build, a bank trade and the end of the action phase', () => {
    expect(undoable(rich(), { type: 'BUILD_ROAD', side: 'right' })).toBe(true)
    expect(undoable(rich(), { type: 'TRADE_WITH_BANK', give: 'wool', receive: 'ore' })).toBe(true)
    expect(undoable(rich(), { type: 'END_ACTION_PHASE' })).toBe(true)
  })

  it('never goes back past a dice roll', () => {
    expect(undoable(rich({ phase: 'roll' }), { type: 'ROLL_DICE' })).toBe(false)
  })

  it('never goes back past a drawn card or an opened stack', () => {
    expect(undoable(rich({ phase: 'draw' }), { type: 'DRAW_CARD', fromDeck: 'stack-1' })).toBe(false)
    expect(undoable(rich({ phase: 'draw' }), { type: 'SEARCH_STACK', deck: 'stack-1', payWith: ['wool', 'wool'] })).toBe(false)
  })

  it('never goes back past newly drawn Regions', () => {
    let s = rich({ regionStack: ['hills-3', 'forest-2'] })
    s = applyAction(s, 'host', { type: 'BUILD_ROAD', side: 'right' })
    expect(undoable(s, { type: 'BUILD_SETTLEMENT', slotIndex: 4 })).toBe(false)
  })

  it('never goes back past a revealed hand (Spy)', () => {
    const base = unlocked()
    const s = { ...base, players: { ...base.players, host: { ...base.players.host, hand: ['spy'] }, guest: { ...base.players.guest, hand: ['abbey'] } } }
    expect(undoable(s, { type: 'PLAY_ACTION_CARD', cardId: 'spy' })).toBe(false)
  })

  it('never goes back once the move passed to the other seat or the game is over', () => {
    expect(undoable(rich({ phase: 'exchange' }), { type: 'SKIP_EXCHANGE' })).toBe(false)
    const s = rich()
    expect(canUndo(s, { ...s, winner: 'host' })).toBe(false)
  })
})
