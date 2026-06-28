import type { CardDefinition, RegionDefinition, PlayerState, ResourceType, Resources, DrawStackId } from './types'

// ─── Central Axis Cards ───────────────────────────────────────────────────────

export const ROAD: CardDefinition = {
  id: 'road',
  nameKey: 'cards.road.name',
  descriptionKey: 'cards.road.description',
  category: 'road',
  cost: { wood: 1, brick: 2 },
  effects: [],
}

export const SETTLEMENT: CardDefinition = {
  id: 'settlement',
  nameKey: 'cards.settlement.name',
  descriptionKey: 'cards.settlement.description',
  category: 'settlement',
  cost: { wood: 1, brick: 1, grain: 1, wool: 1 },
  effects: [],
  directVP: 1,
}

export const CITY: CardDefinition = {
  id: 'city',
  nameKey: 'cards.city.name',
  descriptionKey: 'cards.city.description',
  category: 'city',
  cost: { grain: 2, ore: 3 },
  effects: [],
  directVP: 2,
}

// ─── Region Definitions ───────────────────────────────────────────────────────
// Each region definition is a template. A RegionState references one by id.

export const REGION_DEFINITIONS: RegionDefinition[] = [
  // Forest (Wood)
  { id: 'forest-2', nameKey: 'regions.forest', resourceType: 'wood', productionNumber: 2 },
  { id: 'forest-5', nameKey: 'regions.forest', resourceType: 'wood', productionNumber: 5 },
  { id: 'forest-6', nameKey: 'regions.forest', resourceType: 'wood', productionNumber: 6 },
  // Meadow (Wool)
  { id: 'meadow-3', nameKey: 'regions.meadow', resourceType: 'wool', productionNumber: 3 },
  { id: 'meadow-4', nameKey: 'regions.meadow', resourceType: 'wool', productionNumber: 4 },
  { id: 'meadow-6', nameKey: 'regions.meadow', resourceType: 'wool', productionNumber: 6 },
  // River (Gold)
  { id: 'river-2', nameKey: 'regions.river', resourceType: 'gold', productionNumber: 2 },
  { id: 'river-4', nameKey: 'regions.river', resourceType: 'gold', productionNumber: 4 },
  { id: 'river-5', nameKey: 'regions.river', resourceType: 'gold', productionNumber: 5 },
  // Clay Pit (Brick)
  { id: 'claypit-1', nameKey: 'regions.claypit', resourceType: 'brick', productionNumber: 1 },
  { id: 'claypit-3', nameKey: 'regions.claypit', resourceType: 'brick', productionNumber: 3 },
  { id: 'claypit-5', nameKey: 'regions.claypit', resourceType: 'brick', productionNumber: 5 },
  // Mountain (Ore)
  { id: 'mountain-1', nameKey: 'regions.mountain', resourceType: 'ore', productionNumber: 1 },
  { id: 'mountain-3', nameKey: 'regions.mountain', resourceType: 'ore', productionNumber: 3 },
  { id: 'mountain-4', nameKey: 'regions.mountain', resourceType: 'ore', productionNumber: 4 },
  // Field (Grain)
  { id: 'field-1', nameKey: 'regions.field', resourceType: 'grain', productionNumber: 1 },
  { id: 'field-2', nameKey: 'regions.field', resourceType: 'grain', productionNumber: 2 },
  { id: 'field-6', nameKey: 'regions.field', resourceType: 'grain', productionNumber: 6 },
]

// ─── Green Expansion Cards (Settlement & City slots) ─────────────────────────

export const MILITIAMAN: CardDefinition = {
  id: 'militiaman',
  nameKey: 'cards.militiaman.name',
  descriptionKey: 'cards.militiaman.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { ore: 1, wool: 1 },
  effects: [
    { type: 'GRANT_SYMBOL', symbol: 'strength', amount: 1 },
    { type: 'GRANT_SYMBOL', symbol: 'tournament', amount: 1 },
  ],
}

export const SWORDSMAN: CardDefinition = {
  id: 'swordsman',
  nameKey: 'cards.swordsman.name',
  descriptionKey: 'cards.swordsman.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { ore: 2, wool: 1 },
  effects: [
    { type: 'GRANT_SYMBOL', symbol: 'strength', amount: 2 },
    { type: 'GRANT_SYMBOL', symbol: 'tournament', amount: 2 },
  ],
}

export const KNIGHT: CardDefinition = {
  id: 'knight',
  nameKey: 'cards.knight.name',
  descriptionKey: 'cards.knight.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { ore: 3, wool: 1, grain: 1 },
  effects: [
    { type: 'GRANT_SYMBOL', symbol: 'strength', amount: 3 },
    { type: 'GRANT_SYMBOL', symbol: 'tournament', amount: 3 },
  ],
}

export const MERCHANT: CardDefinition = {
  id: 'merchant',
  nameKey: 'cards.merchant.name',
  descriptionKey: 'cards.merchant.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { gold: 1, wool: 1 },
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'commerce', amount: 1 }],
}

export const MARKET: CardDefinition = {
  id: 'market',
  nameKey: 'cards.market.name',
  descriptionKey: 'cards.market.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { gold: 2, wool: 1 },
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'commerce', amount: 2 }],
}

export const SCHOOL: CardDefinition = {
  id: 'school',
  nameKey: 'cards.school.name',
  descriptionKey: 'cards.school.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { grain: 1, wool: 1 },
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'progress', amount: 1 }],
}

export const LIBRARY: CardDefinition = {
  id: 'library',
  nameKey: 'cards.library.name',
  descriptionKey: 'cards.library.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { grain: 2, wool: 1 },
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'progress', amount: 2 }],
}

export const WATCHTOWER: CardDefinition = {
  id: 'watchtower',
  nameKey: 'cards.watchtower.name',
  descriptionKey: 'cards.watchtower.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { brick: 2, ore: 1 },
  effects: [],
  directVP: 1,
}

// Trade Ships — one per resource type
export const TRADE_SHIP_WOOD: CardDefinition = {
  id: 'trade-ship-wood',
  nameKey: 'cards.tradeShipWood.name',
  descriptionKey: 'cards.tradeShip.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { wood: 1, wool: 1, gold: 1 },
  effects: [{ type: 'IMPROVED_TRADE', resource: 'wood' }],
}

export const TRADE_SHIP_WOOL: CardDefinition = {
  id: 'trade-ship-wool',
  nameKey: 'cards.tradeShipWool.name',
  descriptionKey: 'cards.tradeShip.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { wool: 2, gold: 1 },
  effects: [{ type: 'IMPROVED_TRADE', resource: 'wool' }],
}

export const TRADE_SHIP_GOLD: CardDefinition = {
  id: 'trade-ship-gold',
  nameKey: 'cards.tradeShipGold.name',
  descriptionKey: 'cards.tradeShip.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { gold: 2, wool: 1 },
  effects: [{ type: 'IMPROVED_TRADE', resource: 'gold' }],
}

export const TRADE_SHIP_BRICK: CardDefinition = {
  id: 'trade-ship-brick',
  nameKey: 'cards.tradeShipBrick.name',
  descriptionKey: 'cards.tradeShip.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { brick: 1, wool: 1, gold: 1 },
  effects: [{ type: 'IMPROVED_TRADE', resource: 'brick' }],
}

export const TRADE_SHIP_ORE: CardDefinition = {
  id: 'trade-ship-ore',
  nameKey: 'cards.tradeShipOre.name',
  descriptionKey: 'cards.tradeShip.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { ore: 1, wool: 1, gold: 1 },
  effects: [{ type: 'IMPROVED_TRADE', resource: 'ore' }],
}

export const TRADE_SHIP_GRAIN: CardDefinition = {
  id: 'trade-ship-grain',
  nameKey: 'cards.tradeShipGrain.name',
  descriptionKey: 'cards.tradeShip.description',
  category: 'expansion',
  expansionColor: 'green',
  cost: { grain: 1, wool: 1, gold: 1 },
  effects: [{ type: 'IMPROVED_TRADE', resource: 'grain' }],
}

// ─── Red Expansion Cards (City slots only) ────────────────────────────────────

export const CATHEDRAL: CardDefinition = {
  id: 'cathedral',
  nameKey: 'cards.cathedral.name',
  descriptionKey: 'cards.cathedral.description',
  category: 'expansion',
  expansionColor: 'red',
  cost: { brick: 3, grain: 2 },
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'progress', amount: 2 }],
  directVP: 1,
}

export const GUILD_HALL: CardDefinition = {
  id: 'guild-hall',
  nameKey: 'cards.guildHall.name',
  descriptionKey: 'cards.guildHall.description',
  category: 'expansion',
  expansionColor: 'red',
  cost: { gold: 3, wool: 2 },
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'commerce', amount: 3 }],
}

export const UNIVERSITY: CardDefinition = {
  id: 'university',
  nameKey: 'cards.university.name',
  descriptionKey: 'cards.university.description',
  category: 'expansion',
  expansionColor: 'red',
  cost: { grain: 3, gold: 1 },
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'progress', amount: 3 }],
}

// ─── Brown Expansion Cards (Region slots) ─────────────────────────────────────

export const GOLD_MINE: CardDefinition = {
  id: 'gold-mine',
  nameKey: 'cards.goldMine.name',
  descriptionKey: 'cards.goldMine.description',
  category: 'expansion',
  expansionColor: 'brown',
  cost: { brick: 1, ore: 1 },
  effects: [{ type: 'GRANT_RESOURCE', resource: 'gold', amount: 1 }],
}

export const IRRIGATION: CardDefinition = {
  id: 'irrigation',
  nameKey: 'cards.irrigation.name',
  descriptionKey: 'cards.irrigation.description',
  category: 'expansion',
  expansionColor: 'brown',
  cost: { wood: 1, brick: 1 },
  effects: [{ type: 'GRANT_RESOURCE', resource: 'grain', amount: 1 }],
}

export const SAWMILL: CardDefinition = {
  id: 'sawmill',
  nameKey: 'cards.sawmill.name',
  descriptionKey: 'cards.sawmill.description',
  category: 'expansion',
  expansionColor: 'brown',
  cost: { wood: 2 },
  effects: [{ type: 'GRANT_RESOURCE', resource: 'wood', amount: 1 }],
}

export const FORGE: CardDefinition = {
  id: 'forge',
  nameKey: 'cards.forge.name',
  descriptionKey: 'cards.forge.description',
  category: 'expansion',
  expansionColor: 'brown',
  cost: { ore: 1, wood: 1 },
  effects: [{ type: 'GRANT_RESOURCE', resource: 'ore', amount: 1 }],
}

// ─── Yellow Action Cards ──────────────────────────────────────────────────────

export const AMBUSH: CardDefinition = {
  id: 'ambush',
  nameKey: 'cards.ambush.name',
  descriptionKey: 'cards.ambush.description',
  category: 'action',
  effects: [],
  customEffect: (state, actingPlayer) => {
    const opp: 'host' | 'guest' = actingPlayer === 'host' ? 'guest' : 'host'
    const oppResources = regionResources(state.players[opp])
    // Let the player choose which resource to steal. Offer only what the opponent
    // actually holds; if they hold nothing, the card has no effect.
    const options = (Object.keys(oppResources) as ResourceType[]).filter(r => oppResources[r] > 0)
    if (options.length === 0) return state
    return {
      ...state,
      pendingChoices: [
        ...state.pendingChoices,
        { player: actingPlayer, reason: 'trade', options, takeFrom: opp },
      ],
    }
  },
}

export const CELEBRATION: CardDefinition = {
  id: 'celebration',
  nameKey: 'cards.celebration.name',
  descriptionKey: 'cards.celebration.description',
  category: 'action',
  effects: [{ type: 'GRANT_RESOURCE', resource: 'gold', amount: 1 }],
}

export const INVENTION: CardDefinition = {
  id: 'invention',
  nameKey: 'cards.invention.name',
  descriptionKey: 'cards.invention.description',
  category: 'action',
  effects: [{ type: 'GRANT_SYMBOL', symbol: 'progress', amount: 1 }],
}

// ─── Event Cards ──────────────────────────────────────────────────────────────

export const EVENT_PLAGUE: CardDefinition = {
  id: 'event-plague',
  nameKey: 'cards.eventPlague.name',
  descriptionKey: 'cards.eventPlague.description',
  category: 'event',
  effects: [],
  customEffect: (state, actingPlayer) => {
    const opp: 'host' | 'guest' = actingPlayer === 'host' ? 'guest' : 'host'
    // Remove 1 wool from opponent
    if (regionResources(state.players[opp]).wool <= 0) return state
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: adjustRegions(state.players[opp], 'wool', -1),
      },
    }
  },
}

export const EVENT_GOOD_HARVEST: CardDefinition = {
  id: 'event-good-harvest',
  nameKey: 'cards.eventGoodHarvest.name',
  descriptionKey: 'cards.eventGoodHarvest.description',
  category: 'event',
  effects: [{ type: 'GRANT_RESOURCE', resource: 'grain', amount: 2 }],
}

export const EVENT_TRADE_PROFIT: CardDefinition = {
  id: 'event-trade-profit',
  nameKey: 'cards.eventTradeProfit.name',
  descriptionKey: 'cards.eventTradeProfit.description',
  category: 'event',
  effects: [{ type: 'GRANT_RESOURCE', resource: 'gold', amount: 2 }],
}

// ─── Card Registry ────────────────────────────────────────────────────────────
// Single lookup map for all card definitions. Add new cards here.

export const CARD_REGISTRY: Record<string, CardDefinition> = {
  [ROAD.id]: ROAD,
  [SETTLEMENT.id]: SETTLEMENT,
  [CITY.id]: CITY,
  [MILITIAMAN.id]: MILITIAMAN,
  [SWORDSMAN.id]: SWORDSMAN,
  [KNIGHT.id]: KNIGHT,
  [MERCHANT.id]: MERCHANT,
  [MARKET.id]: MARKET,
  [SCHOOL.id]: SCHOOL,
  [LIBRARY.id]: LIBRARY,
  [WATCHTOWER.id]: WATCHTOWER,
  [TRADE_SHIP_WOOD.id]: TRADE_SHIP_WOOD,
  [TRADE_SHIP_WOOL.id]: TRADE_SHIP_WOOL,
  [TRADE_SHIP_GOLD.id]: TRADE_SHIP_GOLD,
  [TRADE_SHIP_BRICK.id]: TRADE_SHIP_BRICK,
  [TRADE_SHIP_ORE.id]: TRADE_SHIP_ORE,
  [TRADE_SHIP_GRAIN.id]: TRADE_SHIP_GRAIN,
  [CATHEDRAL.id]: CATHEDRAL,
  [GUILD_HALL.id]: GUILD_HALL,
  [UNIVERSITY.id]: UNIVERSITY,
  [GOLD_MINE.id]: GOLD_MINE,
  [IRRIGATION.id]: IRRIGATION,
  [SAWMILL.id]: SAWMILL,
  [FORGE.id]: FORGE,
  [AMBUSH.id]: AMBUSH,
  [CELEBRATION.id]: CELEBRATION,
  [INVENTION.id]: INVENTION,
  [EVENT_PLAGUE.id]: EVENT_PLAGUE,
  [EVENT_GOOD_HARVEST.id]: EVENT_GOOD_HARVEST,
  [EVENT_TRADE_PROFIT.id]: EVENT_TRADE_PROFIT,
}

export const REGION_REGISTRY: Record<string, RegionDefinition> = Object.fromEntries(
  REGION_DEFINITIONS.map(r => [r.id, r])
)

export function getCard(id: string): CardDefinition {
  const card = CARD_REGISTRY[id]
  if (!card) throw new Error(`Unknown card id: ${id}`)
  return card
}

export function getRegion(id: string): RegionDefinition {
  const region = REGION_REGISTRY[id]
  if (!region) throw new Error(`Unknown region id: ${id}`)
  return region
}

// ─── Region resource helpers (for custom card effects) ─────────────────────────
// Resources live on Region cards (0–3 pips). These mirror the engine helpers so
// custom card effects can move resources without importing the engine (avoids a cycle).

function regionResources(player: PlayerState): Resources {
  const r: Resources = { wood: 0, wool: 0, gold: 0, brick: 0, ore: 0, grain: 0 }
  for (const region of player.regions) {
    r[getRegion(region.regionId).resourceType] += region.storedResources
  }
  return r
}

/** Move `amount` of `type` into (positive) or out of (negative) a player's regions, capped 0–3 each. */
function adjustRegions(player: PlayerState, type: ResourceType, amount: number): PlayerState {
  const regions = player.regions.map(r => ({ ...r }))
  let remaining = Math.abs(amount)
  const sign = Math.sign(amount)
  for (const region of regions) {
    if (remaining <= 0) break
    if (getRegion(region.regionId).resourceType !== type) continue
    if (sign > 0) {
      const add = Math.min(3 - region.storedResources, remaining)
      region.storedResources += add
      remaining -= add
    } else {
      const take = Math.min(region.storedResources, remaining)
      region.storedResources -= take
      remaining -= take
    }
  }
  return { ...player, regions }
}

// ─── Default Deck Compositions ────────────────────────────────────────────────

export const DEFAULT_GREEN_DECK: string[] = [
  MILITIAMAN.id, MILITIAMAN.id,
  SWORDSMAN.id, SWORDSMAN.id,
  KNIGHT.id,
  MERCHANT.id, MERCHANT.id,
  MARKET.id,
  SCHOOL.id, SCHOOL.id,
  LIBRARY.id,
  WATCHTOWER.id, WATCHTOWER.id,
  TRADE_SHIP_WOOD.id,
  TRADE_SHIP_WOOL.id,
  TRADE_SHIP_GOLD.id,
  TRADE_SHIP_BRICK.id,
  TRADE_SHIP_ORE.id,
  TRADE_SHIP_GRAIN.id,
]

export const DEFAULT_RED_DECK: string[] = [
  CATHEDRAL.id,
  GUILD_HALL.id,
  UNIVERSITY.id,
]

export const DEFAULT_BROWN_DECK: string[] = [
  GOLD_MINE.id, GOLD_MINE.id,
  IRRIGATION.id, IRRIGATION.id,
  SAWMILL.id, SAWMILL.id,
  FORGE.id, FORGE.id,
]

export const DEFAULT_YELLOW_DECK: string[] = [
  AMBUSH.id, AMBUSH.id,
  CELEBRATION.id, CELEBRATION.id,
  INVENTION.id, INVENTION.id,
]

export const DEFAULT_EVENT_DECK: string[] = [
  EVENT_PLAGUE.id, EVENT_PLAGUE.id,
  EVENT_GOOD_HARVEST.id, EVENT_GOOD_HARVEST.id,
  EVENT_TRADE_PROFIT.id, EVENT_TRADE_PROFIT.id,
]

// ─── Draw Stacks ──────────────────────────────────────────────────────────────
// The hand-draw cards above are not separated by type at draw time. They are
// shuffled together (ALL_DRAW_CARDS) and split into the 5 face-down stacks below.
// The Event deck is not a draw stack — it is resolved on the '?' event-die face.

export const DRAW_STACK_IDS: DrawStackId[] = ['stack-1', 'stack-2', 'stack-3', 'stack-4', 'stack-5']

export const ALL_DRAW_CARDS: string[] = [
  ...DEFAULT_GREEN_DECK,
  ...DEFAULT_RED_DECK,
  ...DEFAULT_BROWN_DECK,
  ...DEFAULT_YELLOW_DECK,
]
