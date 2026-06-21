import { useTranslation } from 'react-i18next'
import type { PendingTrade, PlayerId, ResourceType, Resources, GameAction } from '../engine/types'
import styles from './TradeOfferBanner.module.css'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  wood: '🪵', wool: '🐑', gold: '💰', brick: '🧱', ore: '⛏', grain: '🌾',
}

const ALL_RESOURCES: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']

interface Props {
  offer: PendingTrade
  myId: PlayerId
  onAction: (a: GameAction) => void
}

function basket(r: Partial<Resources>, empty: string) {
  const parts = ALL_RESOURCES.filter(k => (r[k] ?? 0) > 0)
  if (parts.length === 0) return empty
  return parts.map(k => `${r[k]}${RESOURCE_ICONS[k]}`).join(' ')
}

/** Banner shown while a player-to-player trade offer is on the table. */
export default function TradeOfferBanner({ offer, myId, onAction }: Props) {
  const { t } = useTranslation()
  const iAmProposer = offer.from === myId
  const empty = t('game.tradeNothing')

  return (
    <div className={styles.banner}>
      <span className={styles.title}>{t('game.tradeOfferTitle')}</span>
      <span className={styles.line}>
        {t('game.tradeTheyGive')}: {basket(offer.give, empty)}
      </span>
      <span className={styles.line}>
        {t('game.tradeTheyWant')}: {basket(offer.receive, empty)}
      </span>
      <div className={styles.actions}>
        {iAmProposer ? (
          <button className="secondary" onClick={() => onAction({ type: 'DECLINE_TRADE' })}>
            {t('game.cancelOffer')}
          </button>
        ) : (
          <>
            <button className="primary" onClick={() => onAction({ type: 'ACCEPT_TRADE' })}>
              {t('game.acceptTrade')}
            </button>
            <button className="secondary" onClick={() => onAction({ type: 'DECLINE_TRADE' })}>
              {t('game.declineTrade')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
