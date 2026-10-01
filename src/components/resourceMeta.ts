import type { ResourceType } from '../engine/types'

export const RESOURCE_ORDER: ResourceType[] = ['lumber', 'wool', 'brick', 'ore', 'grain', 'gold']

export const RESOURCE_ICON: Record<ResourceType, string> = {
  lumber: '🪵', wool: '🐑', brick: '🧱', ore: '⛏', grain: '🌾', gold: '💰',
}
