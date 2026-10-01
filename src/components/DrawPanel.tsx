import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId, GameAction, ResourceType, Resources } from '../engine/types'
import { getCard, DRAW_STACK_IDS } from '../engine/cards'
import ResourcePicker from './ResourcePicker'
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

/** Draw phase: over the limit, put the excess under a stack; under it, draw each card either
 *  from the top of a stack (free) or by searching a stack (paid). */
export default function DrawPanel({ hand, handLimit, deckSizes, resources, searchCost, onAction }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number[]>([])
  const [toDeck, setToDeck] = useState<DrawStackId>('stack-1')
  const [searchDeck, setSearchDeck] = useState<DrawStackId | null>(null)
  const [payWith, setPayWith] = useState<ResourceType[]>([])

  const excess = hand.length - handLimit

  if (excess > 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.title}>{t('game.draw.discardTitle')}</div>
        <div className={styles.hint}>{t('game.draw.discardHint', { count: excess, limit: handLimit })}</div>
        <div className={styles.cards}>
          {hand.map((id, i) => (
            <button
              key={i}
              className={`${styles.cardChip} ${selected.includes(i) ? styles.selected : ''}`}
              onClick={() => setSelected(s => s.includes(i) ? s.filter(x => x !== i) : s.length < excess ? [...s, i] : s)}
            >
              {t(getCard(id).nameKey)}
            </button>
          ))}
        </div>
        <div className={styles.section}>
          <span className={styles.label}>{t('game.draw.discardTo')}</span>
          <div className={styles.cards}>
            {DRAW_STACK_IDS.map(d => (
              <button key={d} className={`${styles.deckChip} ${toDeck === d ? styles.selected : ''}`} onClick={() => setToDeck(d)}>
                {t(`game.deckName.${d}`)}
              </button>
            ))}
          </div>
        </div>
        <button
          className="primary"
          disabled={selected.length !== excess}
          onClick={() => {
            onAction({ type: 'DISCARD_TO_LIMIT', discards: selected.map(i => ({ cardId: hand[i], toDeck })) })
            setSelected([])
          }}
        >
          {t('game.draw.discardButton')}
        </button>
      </div>
    )
  }

  const totalResources = Object.values(resources).reduce((a, b) => a + b, 0)

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.draw.title')}</div>
      <div className={styles.hint}>
        {t('game.draw.hint', { count: handLimit - hand.length, limit: handLimit, cost: searchCost })}
      </div>
      <div className={styles.cards}>
        {DRAW_STACK_IDS.map(d => (
          <div key={d} className={`${styles.deckChip} ${searchDeck === d ? styles.selected : ''}`}>
            <span>{t(`game.deckName.${d}`)}</span>
            <span className={styles.deckCount}>{deckSizes[d]}</span>
            <button className="secondary" disabled={deckSizes[d] === 0} onClick={() => onAction({ type: 'DRAW_CARD', fromDeck: d })}>
              {t('game.draw.drawTop')}
            </button>
            <button
              className="secondary"
              disabled={deckSizes[d] === 0 || totalResources < searchCost}
              onClick={() => { setSearchDeck(s => s === d ? null : d); setPayWith([]) }}
            >
              {t('game.draw.search')}
            </button>
          </div>
        ))}
      </div>

      {searchDeck && (
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
              onAction({ type: 'SEARCH_STACK', deck: searchDeck, payWith })
              setSearchDeck(null)
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
