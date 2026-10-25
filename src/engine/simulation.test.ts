import { describe, it, expect, vi, afterEach } from 'vitest'
import { createInitialState } from './engine'
import { checkInvariants, mulberry32, step } from './testing/randomBot'

// Plays whole games with simple bots to shake out soft-locks and broken invariants across
// the full rule set (setup, events, building, action cards, drawing, exchanging).

describe('simulated games', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('seed %i plays to a win or 300 turns without breaking invariants', seed => {
    const rng = mulberry32(seed)
    vi.spyOn(Math, 'random').mockImplementation(rng)
    let s = createInitialState({ vpTarget: 12, language: 'en' }, rng)
    checkInvariants(s)

    let steps = 0
    while (!s.winner && s.turn < 300) {
      const next = step(s, rng)
      expect(next, `no progress in phase ${s.phase} (turn ${s.turn})`).not.toBe(s)
      s = next
      checkInvariants(s)
      if (++steps > 20000) throw new Error('runaway game')
    }
    expect(s.turn).toBeGreaterThan(1)
  })
})
