import type { TFunction } from 'i18next'
import { getCard } from '../engine/cards'
import type { GameEvent, PlayerId, Resources, ResourceType } from '../engine/types'
import { RESOURCE_ICON, basket } from './resourceMeta'

/** One activity-log entry as shown to a player: who did it (null for things that happen to
 *  both, like production) and what, plus optional longer text (an event card's effect). */
export interface ActivityLine {
  id: string
  who: string | null
  mine: boolean
  text: string
  detail?: string
}

/** Who a player is from the viewer's seat. Practice is hot-seat, so there it's Player 1/2. */
export function playerLabel(t: TFunction, player: PlayerId, viewer: PlayerId, isPractice: boolean): string {
  if (isPractice) return t('game.log.player', { n: player === 'host' ? 1 : 2 })
  return player === viewer ? t('game.you') : t('game.opponent')
}

/** The card behind a 'returned-to-hand' reason, named in the log line. */
const RETURN_REASON_CARD: Record<string, string> = { civilWar: 'event-civil-war', blackKnight: 'black-knight' }

/** Text for a log entry, or null for entries not worth showing. */
export function describeEvent(t: TFunction, e: GameEvent, viewer: PlayerId, isPractice: boolean): ActivityLine | null {
  const p = (e.payload ?? {}) as Record<string, unknown>
  const who = playerLabel(t, e.player, viewer, isPractice)
  const mine = !isPractice && e.player === viewer
  const line = (text: string, detail?: string): ActivityLine => ({ id: e.id, who, mine, text, detail })
  const global = (text: string, detail?: string): ActivityLine => ({ id: e.id, who: null, mine: false, text, detail })
  const card = (id: unknown) => (typeof id === 'string' ? t(getCard(id).nameKey) : '?')
  const stack = (d: unknown) => t(`game.deckName.${d}`)
  const res = (r: unknown) => `${RESOURCE_ICON[r as ResourceType]} ${t(`resources.${r}`)}`

  /** "You +1🪵 · Opponent +2🐑" for per-player resource changes; empty if nobody changed. */
  const perPlayer = (byPlayer: unknown, sign: string) => {
    const m = (byPlayer ?? {}) as Partial<Record<PlayerId, Partial<Resources>>>
    return (['host', 'guest'] as PlayerId[])
      .filter(pl => basket(m[pl] ?? {}) !== '')
      .map(pl => `${playerLabel(t, pl, viewer, isPractice)} ${sign}${basket(m[pl] ?? {})}`)
      .join(' · ')
  }

  switch (e.type) {
    case 'ROLL_DICE':
      return line(t('game.log.rolled', { symbol: t(`dice.${p.eventSymbol}`), number: p.productionNumber }))
    case 'production': {
      const list = perPlayer(p.gains, '+')
      return global(list ? t('game.log.production', { number: p.roll, list }) : t('game.log.productionNone', { number: p.roll }))
    }
    case 'brigand': {
      const list = perPlayer(p.losses, '−')
      return global(list ? t('game.log.brigand', { list }) : t('game.log.brigandNone'))
    }
    case 'event-card': {
      const def = typeof p.cardId === 'string' ? getCard(p.cardId) : null
      return global(t('game.log.eventCard', { card: card(p.cardId) }), def ? t(def.descriptionKey) : undefined)
    }
    case 'returned-to-hand':
      return line(t('game.log.returnedToHand', { card: card(p.cardId), reason: card(RETURN_REASON_CARD[p.reason as string]) }))
    case 'ANSWER_ATTACK': return line(p.playCounter ? t('game.log.counterPlayed', { card: card(p.cardId) }) : t('game.log.counterDeclined'))
    case 'attack-roll':
      return line(t(p.attackerWins ? 'game.log.attackWon' : 'game.log.attackLost', { die: p.die, card: card(p.cardId) }))
    case 'BUILD_ROAD': return line(t('game.log.buildRoad'))
    case 'BUILD_SETTLEMENT': return line(t(p.scout ? 'game.log.buildSettlementScout' : 'game.log.buildSettlement'))
    case 'BUILD_CITY': return line(t('game.log.buildCity'))
    case 'PLACE_EXPANSION': return line(t('game.log.placeExpansion', { card: card(p.cardId) }))
    case 'DEMOLISH': return line(t('game.log.demolish', { card: card(p.cardId) }))
    case 'PLAY_ACTION_CARD': return line(t('game.log.playCard', { card: card(p.cardId) }))
    case 'TRADE_WITH_BANK':
      return line(t('game.log.bankTrade', {
        give: `${p.rate}${RESOURCE_ICON[p.give as ResourceType]}`, receive: `1${RESOURCE_ICON[p.receive as ResourceType]}`,
      }))
    case 'CHOOSE_RESOURCE':
      return line(t(p.reason === 'commerce' ? 'game.log.tookResource' : 'game.log.choseResource', { resource: res(p.resource) }))
    case 'PROPOSE_TRADE':
      return line(t('game.log.proposeTrade', {
        give: basket(p.give as Partial<Resources>), receive: basket(p.receive as Partial<Resources>),
      }))
    case 'ACCEPT_TRADE': return line(t(p.completed ? 'game.log.acceptTrade' : 'game.log.tradeFailed'))
    case 'DECLINE_TRADE': return line(t(p.byProposer ? 'game.log.withdrawTrade' : 'game.log.declineTrade'))
    case 'END_ACTION_PHASE': return line(t('game.log.endAction'))
    case 'SEARCH_STACK':
      return line(t(p.purpose === 'setup' ? 'game.log.setupSearch' : 'game.log.search', { stack: stack(p.deck) }))
    case 'TAKE_FROM_SEARCH': return line(t('game.log.takeFromSearch', { count: Number(p.count), stack: stack(p.deck) }))
    case 'DRAW_CARD': return line(t('game.log.drawCard', { stack: stack(p.deck) }))
    case 'DISCARD_TO_LIMIT': return line(t('game.log.discard', { count: Number(p.count) }))
    case 'EXCHANGE': return line(t(p.searched ? 'game.log.exchangeSearch' : 'game.log.exchange', { stack: stack(p.deck) }))
    case 'SKIP_EXCHANGE': return line(t('game.log.skipExchange'))
    default: return null
  }
}

/** Entries that pop up as a toast when they arrive: what happens to both players always,
 *  and online also the opponent's moves (their trade offers have their own banner). */
export function isToastWorthy(e: GameEvent, viewer: PlayerId, isPractice: boolean): boolean {
  if (['production', 'brigand', 'event-card', 'returned-to-hand', 'attack-roll', 'ANSWER_ATTACK'].includes(e.type)) return true
  if (isPractice || e.player === viewer) return false
  return !['ROLL_DICE', 'END_ACTION_PHASE', 'PROPOSE_TRADE'].includes(e.type)
}
