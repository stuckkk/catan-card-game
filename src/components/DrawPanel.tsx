import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId, GameAction, ResourceType, Resources } from '../engine/types'
import { DRAW_STACK_IDS } from '../engine/cards'
import ResourcePicker from './ResourcePicker'
import DiscardPanel from './DiscardPanel'
import styles from './Panel.module.css'

interface Props {
  hand: string[]
  handLimit: number
  deckSizes: Record<DeckId, number>
  resources: Resources
  /** Resources a search costs (2, or 1 with a Town Hall). */
  searchCost: number
  onAction: (a: GameAction) => void
}

/** Draw phase: over the limit, put the excess under a stack; under it, draw each card from a chosen
 *  stack, either its top card (free) or by searching it (paid). Same layout as the ExchangePanel. */
export default function DrawPanel({ hand, handLimit, deckSizes, resources, searchCost, onAction }: Props) {
  const { t } = useTranslation()
  const [deck, setDeck] = useState<DrawStackId | null>(null)
  const [searching, setSearching] = useState(false)
  const [payWith, setPayWith] = useState<ResourceType[]>([])

  if (hand.length > handLimit) return <DiscardPanel hand={hand} handLimit={handLimit} onAction={onAction} />

  const ready = deck != null && deckSizes[deck] > 0
  const totalResources = Object.values(resources).reduce((a, b) => a + b, 0)

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.draw.title')}</div>
      <div className={styles.hint}>
        {t('game.draw.hint', { count: handLimit - hand.length, limit: handLimit, cost: searchCost })}
      </div>
      <div className={styles.cards}>
        {DRAW_STACK_IDS.map(d => (
          <button
            key={d}
            className={`${styles.deckChip} ${deck === d ? styles.selected : ''}`}
            disabled={deckSizes[d] === 0}
            onClick={() => { setDeck(p => (p === d ? null : d)); setSearching(false); setPayWith([]) }}
          >
            <span>{t(`game.deckName.${d}`)}</span>
            <span className={styles.deckCount}>{deckSizes[d]}</span>
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <button className="primary" disabled={!ready} onClick={() => ready && onAction({ type: 'DRAW_CARD', fromDeck: deck })}>
          {t('game.draw.drawTop')}
        </button>
        <button className="secondary" disabled={!ready || totalResources < searchCost} onClick={() => setSearching(s => !s)}>
          {t('game.draw.search', { cost: searchCost })}
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
            onClick={() => {
              onAction({ type: 'SEARCH_STACK', deck, payWith })
              setSearching(false)
              setPayWith([])
            }}
          >
            {t('game.pay.confirm')}
          </button>
        </div>
      )}
    </div>
  )
}
