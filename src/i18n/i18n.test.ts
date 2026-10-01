import { describe, it, expect } from 'vitest'
import en from './en.json'
import de from './de.json'
import { CARD_REGISTRY } from '../engine/cards'
import { REGION_DEFINITIONS } from '../engine/regions'
import { EMPTY_RESOURCES } from '../engine/types'

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict)
}

describe.each([['en', en], ['de', de]])('%s translations', (_lang, dict) => {
  it('name and describe every card', () => {
    for (const card of Object.values(CARD_REGISTRY)) {
      expect(lookup(dict, card.nameKey), card.nameKey).toEqual(expect.any(String))
      expect(lookup(dict, card.descriptionKey), card.descriptionKey).toEqual(expect.any(String))
    }
  })

  it('name every region and resource', () => {
    for (const r of REGION_DEFINITIONS) expect(lookup(dict, r.nameKey), r.nameKey).toEqual(expect.any(String))
    for (const r of Object.keys(EMPTY_RESOURCES)) expect(lookup(dict, `resources.${r}`)).toEqual(expect.any(String))
  })
})
