import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DrawStackId, GameAction, PendingHandCardChoice } from '../engine/types'
import { DRAW_STACK_IDS, isSpyTarget } from '../engine/cards'
import CardPicker from './CardPicker'
import dialog from './Dialog.module.css'
import panel from './Panel.module.css'

interface Props {
  choice: PendingHandCardChoice
  /** The opponent's hand, revealed to the picker. */
  hand: string[]
  onAction: (a: GameAction) => void
}

/** Mandatory pick from the opponent's revealed hand. Spy: 1 Unit or Action card (the rest are
 *  dimmed; with none, just continue). Conflict: 2 cards (all, if fewer) and the stack they go under. */
export default function HandCardChoiceModal({ choice, hand, onAction }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number[]>([])
  const [toDeck, setToDeck] = useState<DrawStackId>('stack-1')
  const spy = choice.reason === 'spy'
  const disabled = spy ? hand.flatMap((id, i) => (isSpyTarget(id) ? [] : [i])) : []
  const count = spy ? (disabled.length < hand.length ? 1 : 0) : Math.min(2, hand.length)

  function toggle(i: number) {
    setSelected(s => s.includes(i) ? s.filter(x => x !== i) : count === 1 ? [i] : s.length < count ? [...s, i] : s)
  }

  return (
    <div className={dialog.backdrop} role="dialog" aria-modal="true">
      <div className={dialog.sheet}>
        <div className={dialog.title}>{t(spy ? 'game.handCard.spyTitle' : 'game.handCard.conflictTitle')}</div>
        <p className={dialog.hint}>
          {spy ? t(count ? 'game.handCard.spyHint' : 'game.handCard.spyNothing') : t('game.handCard.conflictHint', { count })}
        </p>
        <CardPicker items={hand.map((cardId, index) => ({ cardId, index }))} selected={selected} disabled={disabled} onToggle={toggle} />
        {!spy && (
          <div className={panel.section}>
            <span className={panel.label}>{t('game.handCard.conflictTo')}</span>
            <div className={panel.cards}>
              {DRAW_STACK_IDS.map(d => (
                <button key={d} className={`${panel.deckChip} ${toDeck === d ? panel.selected : ''}`} onClick={() => setToDeck(d)}>
                  {t(`game.deckName.${d}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={dialog.actions}>
          <button
            className="primary"
            disabled={selected.length !== count}
            onClick={() => onAction({ type: 'CHOOSE_HAND_CARDS', cardIds: selected.map(i => hand[i]), ...(spy ? {} : { toDeck }) })}
          >
            {t(spy ? (count ? 'game.handCard.spyConfirm' : 'game.handCard.spyContinue') : 'game.handCard.conflictConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
