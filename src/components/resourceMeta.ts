import type { ResourceType, Resources } from '../engine/types'

export const RESOURCE_ORDER: ResourceType[] = ['lumber', 'wool', 'brick', 'ore', 'grain', 'gold']

export const RESOURCE_ICON: Record<ResourceType, string> = {
  lumber: '🪵', wool: '🐑', brick: '🧱', ore: '⛏', grain: '🌾', gold: '💰',
}

/** "2🪵 1🐑" */
export function basket(r: Partial<Resources>): string {
  return RESOURCE_ORDER.filter(k => (r[k] ?? 0) > 0).map(k => `${r[k]}${RESOURCE_ICON[k]}`).join(' ')
}

/** How much of each resource is still needed to pay `cost` (empty when affordable). */
export function missingResources(cost: Partial<Resources>, have: Resources): Partial<Resources> {
  const out: Partial<Resources> = {}
  for (const r of RESOURCE_ORDER) {
    const short = (cost[r] ?? 0) - have[r]
    if (short > 0) out[r] = short
  }
  return out
}
