import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, parseLobbyChoices, parseSettings } from './clientSettings'
import { STANDARD_RULES } from '../engine/engine'

describe('Client Settings', () => {
  it('fall back to the defaults for anything missing or unknown', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ computerSpeed: 'warp', turnAlert: 'yes', motion: 1, confirmBuilds: null, toasts: 'loud' }))
      .toEqual(DEFAULT_SETTINGS)
  })

  it('keep every valid stored value', () => {
    const stored = { computerSpeed: 'fast', turnAlert: false, motion: 'off', confirmBuilds: false, toasts: 'short' }
    expect(parseSettings(stored)).toEqual(stored)
  })

  it('keep valid values next to broken ones', () => {
    expect(parseSettings({ computerSpeed: 'slow', toasts: 'loud' })).toEqual({ ...DEFAULT_SETTINGS, computerSpeed: 'slow' })
  })
})

describe('lobby memory', () => {
  it('starts a first visit with an invite game on the rulebook', () => {
    expect(parseLobbyChoices(null)).toEqual({ opponent: 'private', rules: STANDARD_RULES })
  })

  it('restores the last opponent and Game Settings', () => {
    const rules = { vpTarget: 9, actionCardsFromStart: true, brigandGraceTurns: 4, startingPlayer: 'guest' }
    expect(parseLobbyChoices({ opponent: 'computer', rules })).toEqual({ opponent: 'computer', rules })
  })

  it('checks stored rules like the server does', () => {
    expect(parseLobbyChoices({ opponent: 'robot', rules: { vpTarget: 99, brigandGraceTurns: 3 } }))
      .toEqual({ opponent: 'private', rules: { ...STANDARD_RULES, vpTarget: 20 } })
  })
})
