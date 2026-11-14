import { describe, it, expect } from 'vitest'
import { applyAction, applyRoll, createInitialState, projectStateFor } from './engine'
import { mulberry32, withRandom } from './board'
import { makeState, emptyDecks, roll } from './testing/fixtures'
import { step } from './testing/randomBot'
import type { GameState } from './types'

/** The game without what the wall clock and the log ids add. */
const essence = (s: GameState) => ({ ...s, eventLog: s.eventLog.map(e => ({ ...e, id: '', timestamp: 0 })) })

describe('seeded randomness', () => {
  it('withRandom continues the sequence where the state left off', () => {
    const s = makeState({ rngState: 42 })
    const rng = mulberry32(42)
    const expected = [rng(), rng(), rng()]
    const [a, s1] = withRandom(s, r => r())
    const [bc, s2] = withRandom(s1, r => [r(), r()])
    expect([a, ...bc]).toEqual(expected)
    expect(s2.rngState).not.toBe(s.rngState)
    expect(withRandom(s, () => 0)[1].rngState).toBe(42)
  })

  it('rolls the same dice from the same state, and different ones afterwards', () => {
    const s = makeState({ phase: 'roll', turn: 1 })
    const a = applyAction(s, 'host', { type: 'ROLL_DICE' })
    const b = applyAction(s, 'host', { type: 'ROLL_DICE' })
    expect(a.lastRoll).toEqual(b.lastRoll)
    expect(a.rngState).not.toBe(s.rngState)
  })

  it('reshuffles the event deck (Year End) from the game seed', () => {
    const deck = ['event-plague', 'event-progress', 'event-productive-year', 'event-year-end']
    const s = makeState({ phase: 'roll', decks: { ...emptyDecks(), event: deck }, rngState: 7 })
    const a = applyRoll(s, roll('event', 6))
    expect(a.decks.event).toEqual(applyRoll(s, roll('event', 6)).decks.event)
    expect(a.rngState).not.toBe(7)
  })

  it('never shows the generator to a player', () => {
    expect(projectStateFor(makeState(), 'host')).not.toHaveProperty('rngState')
  })

  it('replays a whole game identically from the same deal and the same decisions', () => {
    const play = () => {
      let s = createInitialState({ vpTarget: 12, language: 'en' }, mulberry32(5))
      const decisions = mulberry32(99)
      for (let i = 0; i < 400 && !s.winner; i++) s = step(s, decisions)
      return s
    }
    const a = play()
    expect(a.turn).toBeGreaterThan(5)
    expect(essence(play())).toEqual({ ...essence(a), sessionId: expect.any(String) })
  })
})
