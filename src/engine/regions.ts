import type { PlayerId, RegionDefinition, ResourceType, ProductionNumber } from './types'

// ─── Region Definitions ───────────────────────────────────────────────────────
// A RegionState references one of these by id. The starting sets are read from the picture on
// DE p.2; the rulebook does not list the Region stack's numbers, so that set is a documented
// deviation (GAME_LOGIC.md §2, §12).

const REGION_NAME: Record<ResourceType, string> = {
  lumber: 'forest', wool: 'pasture', brick: 'hills', ore: 'mountains', grain: 'fields', gold: 'goldfield',
}

function region(resourceType: ResourceType, productionNumber: ProductionNumber): RegionDefinition {
  const name = REGION_NAME[resourceType]
  return { id: `${name}-${productionNumber}`, nameKey: `regions.${name}`, resourceType, productionNumber }
}

/** Each player's 6 starting Regions, one per resource: Player A (host) and Player B (guest)
 *  have different numbers. */
export const STARTING_REGIONS: Record<PlayerId, RegionDefinition[]> = {
  host: [
    region('grain', 1), region('ore', 2), region('wool', 3),
    region('lumber', 4), region('brick', 5), region('gold', 6),
  ],
  guest: [
    region('grain', 2), region('ore', 3), region('wool', 4),
    region('lumber', 5), region('brick', 6), region('gold', 1),
  ],
}

/** The 11-card Region stack: 2 each of Forest, Pasture, Hills, Mountains, Fields; 1 Gold Field. */
export const STACK_REGIONS: RegionDefinition[] = [
  region('grain', 3), region('grain', 5),
  region('ore', 4), region('ore', 6),
  region('wool', 1), region('wool', 5),
  region('lumber', 2), region('lumber', 6),
  region('brick', 3), region('brick', 4),
  region('gold', 2),
]

export const REGION_DEFINITIONS: RegionDefinition[] = [...STARTING_REGIONS.host, ...STARTING_REGIONS.guest, ...STACK_REGIONS]

export const REGION_REGISTRY: Record<string, RegionDefinition> = Object.fromEntries(
  REGION_DEFINITIONS.map(r => [r.id, r])
)

export function getRegion(id: string): RegionDefinition {
  const def = REGION_REGISTRY[id]
  if (!def) throw new Error(`Unknown region id: ${id}`)
  return def
}
