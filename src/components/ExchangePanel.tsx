import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId, GameAction, ResourceType, Resources } from '../engine/types'
import { totalOf } from '../engine/board'
import CardPicker from './CardPicker'
import PaidSearch from './PaidSearch'
import StackChips from './StackChips'
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

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.exchange.title')}</div>
      <div className={styles.hint}>{t('game.exchange.hint')}</div>

      <div className={styles.section}>
        <span className={styles.label}>{t('game.exchange.cardLabel')}</span>
        <CardPicker
          items={hand.map((cardId, index) => ({ cardId, index }))}
          selected={cardIndex != null ? [cardIndex] : []}
          onToggle={i => setCardIndex(c => (c === i ? null : i))}
        />
      </div>

      <div className={styles.section}>
        <span className={styles.label}>{t('game.exchange.stackLabel')}</span>
        <StackChips selected={deck} counts={deckSizes} onPick={d => setDeck(p => (p === d ? null : d))} />
      </div>

      <div className={styles.actions}>
        <button className="primary" disabled={!ready} onClick={() => ready && onAction({ type: 'EXCHANGE', cardId, deck })}>
          {t('game.exchange.top')}
        </button>
        <button className="secondary" disabled={!ready || totalOf(resources) < searchCost} onClick={() => setSearching(s => !s)}>
          {t('game.exchange.search', { cost: searchCost })}
        </button>
      </div>

      {searching && ready && (
        <PaidSearch
          cost={searchCost}
          available={resources}
          value={payWith}
          onChange={setPayWith}
          onConfirm={() => onAction({ type: 'EXCHANGE', cardId, deck, payWith })}
        />
      )}
    </div>
  )
}
