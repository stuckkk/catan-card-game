import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId, GameAction, ResourceType, Resources } from '../engine/types'
import { getCard, DRAW_STACK_IDS } from '../engine/cards'
import ResourcePicker from './ResourcePicker'
import styles from './Panel.module.css'

interface Props {
  hand: string[]
  deckSizes: Record<DeckId, number>
  resources: Resources
  searchCost: number
  onAction: (a: GameAction) => void
}

/** Optional exchange (only when the hand was already at the limit): put 1 card under a stack,
 *  then take that stack's top card or search it. Skipping is a separate control. */
export default function ExchangePanel({ hand, deckSizes, resources, searchCost, onAction }: Props) {
  const { t } = useTranslation()
  const [cardIndex, setCardIndex] = useState<number | null>(null)
  const [deck, setDeck] = useState<DrawStackId | null>(null)
  const [searching, setSearching] = useState(false)
  const [payWith, setPayWith] = useState<ResourceType[]>([])

  const cardId = cardIndex != null ? hand[cardIndex] : null
  const ready = cardId != null && deck != null
  const totalResources = Object.values(resources).reduce((a, b) => a + b, 0)

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.exchange.title')}</div>
      <div className={styles.hint}>{t('game.exchange.hint')}</div>

      <div className={styles.section}>
        <span className={styles.label}>{t('game.exchange.cardLabel')}</span>
        <div className={styles.cards}>
          {hand.map((id, i) => (
            <button
              key={i}
              className={`${styles.cardChip} ${cardIndex === i ? styles.selected : ''}`}
              onClick={() => setCardIndex(c => (c === i ? null : i))}
            >
              {t(getCard(id).nameKey)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.label}>{t('game.exchange.stackLabel')}</span>
        <div className={styles.cards}>
          {DRAW_STACK_IDS.map(d => (
            <button key={d} className={`${styles.deckChip} ${deck === d ? styles.selected : ''}`} onClick={() => setDeck(p => (p === d ? null : d))}>
              <span>{t(`game.deckName.${d}`)}</span>
              <span className={styles.deckCount}>{deckSizes[d]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <button className="primary" disabled={!ready} onClick={() => ready && onAction({ type: 'EXCHANGE', cardId, deck })}>
          {t('game.exchange.top')}
        </button>
        <button className="secondary" disabled={!ready || totalResources < searchCost} onClick={() => setSearching(s => !s)}>
          {t('game.exchange.search', { cost: searchCost })}
        </button>
      </div>

      {searching && ready && (
        <div className={styles.paid}>
          <ResourcePicker
            label={t('game.pay.label', { count: searchCost })}
            max={searchCost}
            available={resources}
            value={payWith}
            onChange={setPayWith}
          />
          <button
            className="primary"
            disabled={payWith.length !== searchCost}
            onClick={() => onAction({ type: 'EXCHANGE', cardId, deck, payWith })}
          >
            {t('game.pay.confirm')}
          </button>
        </div>
      )}
    </div>
  )
}
