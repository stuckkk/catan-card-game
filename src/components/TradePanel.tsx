import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Resources, ResourceType, GameAction, PlayerState } from '../engine/types'
import { getTradeRate } from '../engine/engine'
import styles from './TradePanel.module.css'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  wood: '🪵', wool: '🐑', gold: '💰', brick: '🧱', ore: '⛏', grain: '🌾',
}

const ALL_RESOURCES: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']

interface Props {
  resources: Resources
  /** Played cards drive the trade rate (2:1 with a matching IMPROVED_TRADE card). */
  playedCards: string[]
  onAction: (a: GameAction) => void
}

/** Bank trade: give N of one resource (3:1 by default, 2:1 with a harbour card) for 1 of another. */
export default function TradePanel({ resources, playedCards, onAction }: Props) {
  const { t } = useTranslation()
  const [give, setGive] = useState<ResourceType | null>(null)
  const [receive, setReceive] = useState<ResourceType | null>(null)

  const rate = give ? getTradeRate({ playedCards } as PlayerState, give) : 3
  const canTrade = give !== null && receive !== null && give !== receive && resources[give] >= rate

  function doTrade() {
    if (!canTrade || !give || !receive) return
    onAction({ type: 'TRADE_WITH_BANK', give, receive })
    setGive(null)
    setReceive(null)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.trade')}</div>

      <div className={styles.row}>
        <span className={styles.label}>{t('game.tradeGive')}</span>
        <div className={styles.picker}>
          {ALL_RESOURCES.map(r => (
            <button
              key={r}
              className={`${styles.chip} ${give === r ? styles.selected : ''}`}
              disabled={resources[r] < 2}
              onClick={() => setGive(g => (g === r ? null : r))}
              title={t(`resources.${r}`)}
            >
              <span className={styles.icon}>{RESOURCE_ICONS[r]}</span>
              <span className={styles.count}>{resources[r]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>{t('game.tradeReceive')}</span>
        <div className={styles.picker}>
          {ALL_RESOURCES.map(r => (
            <button
              key={r}
              className={`${styles.chip} ${receive === r ? styles.selected : ''} ${give === r ? styles.disabledChip : ''}`}
              disabled={give === r}
              onClick={() => setReceive(v => (v === r ? null : r))}
              title={t(`resources.${r}`)}
            >
              <span className={styles.icon}>{RESOURCE_ICONS[r]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.action}>
        {give && (
          <span className={styles.rate}>{t('game.tradeRate', { rate })}</span>
        )}
        <button className="primary" disabled={!canTrade} onClick={doTrade}>
          {t('game.tradeButton')}
        </button>
      </div>
    </div>
  )
}
