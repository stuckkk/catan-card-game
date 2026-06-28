import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, GameAction } from '../engine/types'
import { getCard, DRAW_STACK_IDS } from '../engine/cards'
import styles from './HandCheckPanel.module.css'

const DRAW_DECKS = DRAW_STACK_IDS

interface Props {
  hand: string[]
  handLimit: number
  decks: Record<DeckId, string[]>
  onAction: (a: GameAction) => void
}

/**
 * End-of-turn hand-limit check. Over the limit: select cards to discard. Under the
 * limit: draw cards one at a time from a stack of your choice until you reach it.
 */
export default function HandCheckPanel({ hand, handLimit, decks, onAction }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number[]>([])

  const overflow = hand.length - handLimit

  if (overflow > 0) {
    const canDiscard = selected.length >= overflow
    const discard = () => {
      if (!canDiscard) return
      onAction({ type: 'DISCARD_TO_LIMIT', cardIds: selected.map(i => hand[i]) })
      setSelected([])
    }
    return (
      <div className={styles.panel}>
        <div className={styles.title}>{t('game.handCheckDiscardTitle')}</div>
        <div className={styles.hint}>{t('game.handCheckDiscardHint', { count: overflow, limit: handLimit })}</div>
        <div className={styles.cards}>
          {hand.map((id, i) => (
            <button
              key={i}
              className={`${styles.cardChip} ${selected.includes(i) ? styles.selected : ''}`}
              onClick={() => setSelected(s => (s.includes(i) ? s.filter(x => x !== i) : [...s, i]))}
            >
              {t(getCard(id).nameKey)}
            </button>
          ))}
        </div>
        <button className="primary" disabled={!canDiscard} onClick={discard}>
          {t('game.handCheckDiscardButton')}
        </button>
      </div>
    )
  }

  // Under the limit: draw cards. If every draw deck is empty, allow continuing anyway.
  const needed = handLimit - hand.length
  const exhausted = DRAW_DECKS.every(d => decks[d].length === 0)
  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.handCheckDrawTitle')}</div>
      <div className={styles.hint}>{t('game.handCheckDrawHint', { count: needed, limit: handLimit })}</div>
      <div className={styles.cards}>
        {DRAW_DECKS.map(d => (
          <button
            key={d}
            className={styles.deckChip}
            disabled={decks[d].length === 0}
            onClick={() => onAction({ type: 'DRAW_TO_LIMIT', fromDeck: d })}
          >
            <span>{t(`game.deckName.${d}`)}</span>
            <span className={styles.deckCount}>{decks[d].length}</span>
          </button>
        ))}
      </div>
      {exhausted && (
        <button className="primary" onClick={() => onAction({ type: 'DRAW_TO_LIMIT', fromDeck: 'stack-1' })}>
          {t('game.handCheckContinue')}
        </button>
      )}
    </div>
  )
}
