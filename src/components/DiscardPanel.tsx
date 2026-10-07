import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DrawStackId, GameAction } from '../engine/types'
import { DRAW_STACK_IDS } from '../engine/cards'
import CardPicker from './CardPicker'
import styles from './Panel.module.css'

interface Props {
  hand: string[]
  handLimit: number
  onAction: (a: GameAction) => void
}

/** Over the hand limit: pick the excess cards and the stack to put them under. */
export default function DiscardPanel({ hand, handLimit, onAction }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number[]>([])
  const [toDeck, setToDeck] = useState<DrawStackId>('stack-1')
  const excess = hand.length - handLimit

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.draw.discardTitle')}</div>
      <div className={styles.hint}>{t('game.draw.discardHint', { count: excess, limit: handLimit })}</div>
      <CardPicker
        items={hand.map((cardId, index) => ({ cardId, index }))}
        selected={selected}
        onToggle={i => setSelected(s => s.includes(i) ? s.filter(x => x !== i) : s.length < excess ? [...s, i] : s)}
      />
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
