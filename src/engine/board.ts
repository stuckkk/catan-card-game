import { EMPTY_RESOURCES } from './types'
import type { CentralSlot, PlayerState, ResourceType, Resources } from './types'
import { getRegion } from './regions'

// ─── Region-based Resources ────────────────────────────────────────────────────
// Resources are stored directly on a player's Regions (0–3 each). These helpers treat
// the Regions as the single source of truth for spendable resources. Shared by the
// engine and by card custom effects (kept free of a cards.ts import to avoid a cycle).

export const ALL_RESOURCE_TYPES = Object.keys(EMPTY_RESOURCES) as ResourceType[]

/** A player's spendable resources, summed from region storage by resource type. */
export function availableResources(player: PlayerState): Resources {
  const r: Resources = { ...EMPTY_RESOURCES }
  for (const region of player.regions) {
    r[getRegion(region.regionId).resourceType] += region.storedResources
  }
  return r
}

export function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (Object.keys(cost) as ResourceType[]).every(r => resources[r] >= (cost[r] ?? 0))
}

/** Count a list of resource picks (e.g. ['ore', 'ore', 'wool']) into a Resources-shaped cost. */
export function countResources(list: ResourceType[]): Partial<Resources> {
  const out: Partial<Resources> = {}
  for (const r of list) out[r] = (out[r] ?? 0) + 1
  return out
}

/** Free capacity (up to 3 per region) across a player's regions of one type. */
export function roomFor(player: PlayerState, type: ResourceType): number {
  return player.regions
    .filter(r => getRegion(r.regionId).resourceType === type)
    .reduce((sum, r) => sum + (3 - r.storedResources), 0)
}

/** Spend a cost from a player's regions, drawing greedily from regions of each type.
 *  Assumes affordability was already checked. */
export function spendFromRegions(player: PlayerState, cost: Partial<Resources>): PlayerState {
  const regions = player.regions.map(r => ({ ...r }))
  for (const [res, amount] of Object.entries(cost) as [ResourceType, number][]) {
    let remaining = amount ?? 0
    for (const region of regions) {
      if (remaining <= 0) break
      if (getRegion(region.regionId).resourceType !== res) continue
      const take = Math.min(region.storedResources, remaining)
      region.storedResources -= take
      remaining -= take
    }
  }
  return { ...player, regions }
}

/** Add resources to a player's regions of the matching type, capped at 3 each
 *  (overflow is lost). Distributes across multiple matching regions. */
export function addToRegions(player: PlayerState, gain: Partial<Resources>): PlayerState {
  const regions = player.regions.map(r => ({ ...r }))
  for (const [res, amount] of Object.entries(gain) as [ResourceType, number][]) {
    let remaining = amount ?? 0
    for (const region of regions) {
      if (remaining <= 0) break
      if (getRegion(region.regionId).resourceType !== res) continue
      const add = Math.min(3 - region.storedResources, remaining)
      region.storedResources += add
      remaining -= add
    }
  }
  return { ...player, regions }
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Board Geometry ────────────────────────────────────────────────────────────
// A Settlement/City lists its corner Regions as [topLeft, bottomLeft, topRight, bottomRight].
// Its Building Sites are split in half: the first half sits above the axis, the second below.

export function isSettlementLike(slot: CentralSlot): boolean {
  return slot.kind === 'settlement' || slot.kind === 'city'
}

export function siteSide(slot: CentralSlot, expansionSlotIndex: number): 'above' | 'below' {
  return expansionSlotIndex < slot.expansionSlots.length / 2 ? 'above' : 'below'
}

/** The 2 Regions a Building Site borders: its side's left and right corners. */
export function siteNeighbours(slot: CentralSlot, expansionSlotIndex: number): number[] {
  const [topLeft, bottomLeft, topRight, bottomRight] = slot.regionIndices
  return siteSide(slot, expansionSlotIndex) === 'above' ? [topLeft, topRight] : [bottomLeft, bottomRight]
}

/** For each region index, how many of the player's placed cards matching `match` border it. */
export function regionsBorderingCards(
  player: PlayerState,
  match: (cardId: string) => boolean,
): Map<number, number> {
  const counts = new Map<number, number>()
  for (const slot of player.principality) {
    if (!isSettlementLike(slot)) continue
    slot.expansionSlots.forEach((cardId, i) => {
      if (!cardId || !match(cardId)) return
      for (const ri of siteNeighbours(slot, i)) counts.set(ri, (counts.get(ri) ?? 0) + 1)
    })
  }
  return counts
}

/** All region indices that border one of the player's Cities (each listed once). */
export function cityRegionIndices(player: PlayerState, cityMatch: (slot: CentralSlot) => boolean = () => true): Set<number> {
  const out = new Set<number>()
  for (const slot of player.principality) {
    if (slot.kind === 'city' && cityMatch(slot)) slot.regionIndices.forEach(ri => out.add(ri))
  }
  return out
}
