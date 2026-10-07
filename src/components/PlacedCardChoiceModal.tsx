import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CentralSlot, GameAction, PendingPlacedCardChoice } from '../engine/types'
import CardPicker from './CardPicker'
import dialog from './Dialog.module.css'

interface Props {
  choice: PendingPlacedCardChoice
  /** The principality of the player whose card is picked (public). */
  ownerPrincipality: CentralSlot[]
  onAction: (a: GameAction) => void
}

/** Mandatory pick of one of the opponent's placed cards (Civil War: the unit that goes back to
 *  their hand). No cancel — a card must be chosen to resume the turn. */
export default function PlacedCardChoiceModal({ choice, ownerPrincipality, onAction }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number | null>(null)
  const items = choice.options.map((o, index) => ({
    cardId: ownerPrincipality[o.slotIndex].expansionSlots[o.expansionSlotIndex]!,
    index,
  }))

  return (
    <div className={dialog.backdrop} role="dialog" aria-modal="true">
      <div className={dialog.sheet}>
        <div className={dialog.title}>{t(`game.${choice.reason}.title`)}</div>
        <CardPicker items={items} selected={selected === null ? [] : [selected]} onToggle={i => setSelected(s => s === i ? null : i)} />
        <div className={dialog.actions}>
          <button
            className="primary"
            disabled={selected === null}
            onClick={() => selected !== null && onAction({ type: 'CHOOSE_PLACED_CARD', ...choice.options[selected] })}
          >
            {t(`game.${choice.reason}.confirm`)}
          </button>
        </div>
      </div>
    </div>
  )
}
