import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyAction, createInitialState } from '../engine/engine'
import { clearLocalGame, loadLocalGame, saveLocalGame } from './persistence'

describe('local game persistence', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('brings back the game as it was after its last action', () => {
    const initial = createInitialState({ language: 'en' })
    const first = initial.setup.firstPlayer
    const played = applyAction(initial, first, { type: 'SEARCH_STACK', deck: 'stack-1' })
    expect(played).not.toBe(initial)

    saveLocalGame(played)
    expect(loadLocalGame(initial.sessionId)).toEqual(played)
  })

  it('does not hand a saved game to a different one', () => {
    saveLocalGame(createInitialState({ language: 'en' }))
    expect(loadLocalGame('another-game')).toBeNull()
  })

  it('forgets the game once cleared, and survives missing storage', () => {
    const state = createInitialState({ language: 'en' })
    saveLocalGame(state)
    clearLocalGame()
    expect(loadLocalGame(state.sessionId)).toBeNull()

    vi.unstubAllGlobals()
    expect(() => saveLocalGame(state)).not.toThrow()
    expect(loadLocalGame(state.sessionId)).toBeNull()
  })
})
