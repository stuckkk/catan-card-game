import { describe, it, expect } from 'vitest'
import i18next from 'i18next'
import en from '../i18n/en.json'
import de from '../i18n/de.json'
import { describeEvent } from './activityText'
import type { GameEvent } from '../engine/types'

async function translator(lng: 'en' | 'de') {
  const i18n = i18next.createInstance()
  await i18n.init({ resources: { en: { translation: en }, de: { translation: de } }, lng, fallbackLng: 'en', interpolation: { escapeValue: false } })
  return i18n.t
}

const event = (type: string, payload: Record<string, unknown> = {}): GameEvent =>
  ({ id: '1', timestamp: 0, player: 'host', type, payload })

describe('activity log lines', () => {
  it('conjugates German for your own moves and the opponent’s', async () => {
    const t = await translator('de')
    expect(describeEvent(t, event('BUILD_CITY'), 'host', false)).toMatchObject({ who: 'Du', text: 'baust eine Stadt' })
    expect(describeEvent(t, event('BUILD_CITY'), 'guest', false)).toMatchObject({ who: 'Gegner', text: 'baut eine Stadt' })
    expect(describeEvent(t, event('DRAW_CARD', { deck: 'stack-1' }), 'host', false)?.text).toMatch(/^ziehst eine Karte/)
    expect(describeEvent(t, event('DISCARD_TO_LIMIT', { count: 2 }), 'host', false)?.text).toBe('legst 2 Karten unter Stapel')
  })

  it('keeps the third person in practice mode and where the verb is the same (German)', async () => {
    const t = await translator('de')
    expect(describeEvent(t, event('BUILD_CITY'), 'host', true)?.text).toBe('baut eine Stadt')
    expect(describeEvent(t, event('DEMOLISH', { cardId: 'abbey' }), 'host', false)?.text).toMatch(/^reißt .* ab$/)
  })

  it('uses the same past-tense line for everyone in English', async () => {
    const t = await translator('en')
    expect(describeEvent(t, event('BUILD_CITY'), 'host', false)?.text).toBe('built a City')
    expect(describeEvent(t, event('SEARCH_STACK', { deck: 'stack-1', purpose: 'setup' }), 'host', false)?.text)
      .toMatch(/^looked through .* for starting cards$/)
  })
})
