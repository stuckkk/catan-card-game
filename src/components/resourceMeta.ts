import type { ResourceType, Resources } from '../engine/types'
import { ALL_RESOURCE_TYPES } from '../engine/board'

export const RESOURCE_ICON: Record<ResourceType, string> = {
  lumber: '🪵', wool: '🐑', brick: '🧱', ore: '⛏️', grain: '🌾', gold: '💰',
}

export const RESOURCE_COLOR: Record<ResourceType, string> = {
  lumber: 'var(--color-lumber)',
  wool: 'var(--color-wool)',
  gold: 'var(--color-gold)',
  brick: 'var(--color-brick)',
  ore: 'var(--color-ore)',
  grain: 'var(--color-grain)',
}

/** "2🪵 1🐑" */
export function basket(r: Partial<Resources>): string {
  return ALL_RESOURCE_TYPES.filter(k => (r[k] ?? 0) > 0).map(k => `${r[k]}${RESOURCE_ICON[k]}`).join(' ')
}

/** How much of each resource is still needed to pay `cost` (empty when affordable). */
export function missingResources(cost: Partial<Resources>, have: Resources): Partial<Resources> {
  const out: Partial<Resources> = {}
  for (const r of ALL_RESOURCE_TYPES) {
    const short = (cost[r] ?? 0) - have[r]
    if (short > 0) out[r] = short
  }
  return out
}
