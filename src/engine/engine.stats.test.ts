import { describe, it, expect } from 'vitest'
import { applyAction, applyRoll } from './engine'
import { makeState, makePlayer, regionsWith, roll, settlementA, settlementB, road, playedFor } from './testing/fixtures'

describe('game statistics', () => {
  it('counts both dice of every roll', () => {
    const s = applyRoll(makeState({ phase: 'roll' }), roll('tournament', 3))
    expect(s.stats.productionRolls).toEqual([0, 0, 1, 0, 0, 0])
    expect(s.stats.eventRolls).toMatchObject({ tournament: 1, brigand: 0 })
  })

  it('counts the number an Alchemist set, not the one rolled', () => {
    const s = applyRoll(makeState({ phase: 'roll', alchemistNumber: 5 }), roll('tournament', 3))
    expect(s.stats.productionRolls).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('records what each Region produced, without what did not fit', () => {
    const host = makePlayer('host', { regions: regionsWith({ wool: 3 }) })
    const s = applyRoll(makeState({ phase: 'roll', players: { host, guest: makePlayer('guest') } }), roll('tournament', 3))
    expect(s.stats.produced).toEqual({ host: {}, guest: { 'pasture-3': 1 } })
    const again = applyRoll({ ...s, phase: 'roll' }, roll('tournament', 3))
    expect(again.stats.produced.guest).toEqual({ 'pasture-3': 2 })
  })

  it('records both players’ VP when a turn ends', () => {
    const s = applyAction(makeState({ phase: 'exchange' }), 'host', { type: 'SKIP_EXCHANGE' })
    expect(s.stats.vpHistory).toEqual([{ host: 2, guest: 2 }])
  })

  it('records the final VP when the game is won', () => {
    const cities = [settlementA([null, null, null, null]), road(), settlementB()]
    const host = makePlayer('host', { principality: cities, playedCards: playedFor(cities), regions: regionsWith({ ore: 3, grain: 2 }) })
    const start = makeState({ players: { host, guest: makePlayer('guest') }, config: { ...makeState().config, vpTarget: 4 } })
    const s = applyAction(start, 'host', { type: 'BUILD_CITY', slotIndex: 2 })
    expect(s.winner).toBe('host')
    expect(s.stats.vpHistory).toEqual([{ host: 4, guest: 2 }])
  })
})
