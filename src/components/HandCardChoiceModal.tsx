import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DrawStackId, GameAction, PendingHandCardChoice } from '../engine/types'
import { isSpyTarget } from '../engine/cards'
import CardPicker from './CardPicker'
import { toggleIndex } from './selection'
import Modal from './Modal'
import StackChips from './StackChips'
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

  return (
    <Modal>
      <div className={dialog.title}>{t(spy ? 'game.handCard.spyTitle' : 'game.handCard.conflictTitle')}</div>
      <p className={dialog.hint}>
        {spy ? t(count ? 'game.handCard.spyHint' : 'game.handCard.spyNothing') : t('game.handCard.conflictHint', { count })}
      </p>
      <CardPicker items={hand.map((cardId, index) => ({ cardId, index }))} selected={selected} disabled={disabled} onToggle={i => setSelected(s => toggleIndex(s, i, count))} />
      {!spy && (
        <div className={panel.section}>
          <span className={panel.label}>{t('game.handCard.conflictTo')}</span>
          <StackChips selected={toDeck} onPick={setToDeck} />
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
    </Modal>
  )
}
