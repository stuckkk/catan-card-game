import { useTranslation } from 'react-i18next'
import type { PendingTrade, PlayerId, GameAction } from '../engine/types'
import { basket } from './resourceMeta'
import styles from './TradeOfferBanner.module.css'

interface Props {
  offer: PendingTrade
  myId: PlayerId
  onAction: (a: GameAction) => void
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
        {t('game.tradeTheyGive')}: {basket(offer.give) || empty}
      </span>
      <span className={styles.line}>
        {t('game.tradeTheyWant')}: {basket(offer.receive) || empty}
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
