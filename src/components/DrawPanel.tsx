import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId, GameAction, ResourceType, Resources } from '../engine/types'
import { totalOf } from '../engine/board'
import DiscardPanel from './DiscardPanel'
import PaidSearch from './PaidSearch'
import StackChips from './StackChips'
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

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.draw.title')}</div>
      <div className={styles.hint}>
        {t('game.draw.hint', { count: handLimit - hand.length, limit: handLimit, cost: searchCost })}
      </div>
      <StackChips
        selected={deck}
        counts={deckSizes}
        disabled={d => deckSizes[d] === 0}
        onPick={d => { setDeck(p => (p === d ? null : d)); setSearching(false); setPayWith([]) }}
      />

      <div className={styles.actions}>
        <button className="primary" disabled={!ready} onClick={() => ready && onAction({ type: 'DRAW_CARD', fromDeck: deck })}>
          {t('game.draw.drawTop')}
        </button>
        <button className="secondary" disabled={!ready || totalOf(resources) < searchCost} onClick={() => setSearching(s => !s)}>
          {t('game.draw.search', { cost: searchCost })}
        </button>
      </div>

      {searching && ready && (
        <PaidSearch
          cost={searchCost}
          available={resources}
          value={payWith}
          onChange={setPayWith}
          onConfirm={() => {
            onAction({ type: 'SEARCH_STACK', deck, payWith })
            setSearching(false)
            setPayWith([])
          }}
        />
      )}
    </div>
  )
}
