import { describe, it, expect } from 'vitest'
import { createTutorialGame, tutorialStep } from './tutorial'
import { makeState } from '../engine/testing/fixtures'

describe('tutorial', () => {
  it('always deals the same game, with the player starting', () => {
    const a = createTutorialGame('en')
    const b = createTutorialGame('en')
    expect(a.setup.firstPlayer).toBe('host')
    expect({ ...a, sessionId: '' }).toEqual({ ...b, sessionId: '' })
  })

  it('follows the game through the first two turns', () => {
    const at = (over: Parameters<typeof makeState>[0]) => tutorialStep(makeState(over))
    expect(at({ phase: 'setup', turn: 0, setup: { firstPlayer: 'host', picked: {} } })).toBe('setup')
    expect(at({ phase: 'setup', turn: 0, setup: { firstPlayer: 'host', picked: { host: 'stack-1' } } })).toBe('opponentSetup')
    expect(at({ phase: 'roll', turn: 1 })).toBe('roll')
    expect(at({ phase: 'event-resolution', turn: 1 })).toBe('event')
    expect(at({ phase: 'action', turn: 1 })).toBe('action')
    expect(at({ phase: 'draw', turn: 1 })).toBe('draw')
    expect(at({ phase: 'exchange', turn: 1 })).toBe('draw')
    expect(at({ phase: 'roll', turn: 2 })).toBe('opponentTurn')
    expect(at({ phase: 'roll', turn: 3 })).toBe('free')
  })
})
