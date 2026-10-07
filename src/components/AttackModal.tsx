import { useTranslation } from 'react-i18next'
import { COUNTER_CARD, getCard } from '../engine/cards'
import type { GameAction, PendingAttackRoll, PendingCounter } from '../engine/types'
import CardView from './CardView'
import dialog from './Dialog.module.css'

interface Props {
  choice: PendingCounter | PendingAttackRoll
  /** The viewer's hand: the counter card can only be played if it is in there. */
  hand: string[]
  onAction: (a: GameAction) => void
}

/** Attack duel (Black Knight): first the defender may play the counter card, then the attacker
 *  rolls. No cancel — the attack has to be resolved before the turn goes on. */
export default function AttackModal({ choice, hand, onAction }: Props) {
  const { t } = useTranslation()
  const card = t(getCard(choice.attackCardId).nameKey)
  const counterId = COUNTER_CARD[choice.attackCardId]
  const counter = t(getCard(counterId).nameKey)
  const hasCounter = hand.includes(counterId)

  return (
    <div className={dialog.backdrop} role="dialog" aria-modal="true">
      <div className={dialog.sheet}>
        <div className={dialog.cardRow}>
          <CardView cardId={choice.attackCardId} />
          {choice.kind === 'attackRoll' && choice.countered && <CardView cardId={counterId} />}
        </div>
        {choice.kind === 'counter' ? (
          <>
            <div className={dialog.title}>{t('game.attack.counterTitle', { card })}</div>
            <p className={dialog.hint}>{t('game.attack.counterHint', { counter })}</p>
            {!hasCounter && <p className={dialog.hint}>{t('game.attack.noCounter', { counter })}</p>}
            <div className={dialog.actions}>
              <button className="secondary" onClick={() => onAction({ type: 'ANSWER_ATTACK', playCounter: false })}>
                {t('game.attack.letRoll')}
              </button>
              <button className="primary" disabled={!hasCounter} onClick={() => onAction({ type: 'ANSWER_ATTACK', playCounter: true })}>
                {t('game.attack.playCounter', { counter })}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={dialog.title}>{t('game.attack.rollTitle', { card })}</div>
            <p className={dialog.hint}>
              {choice.countered ? t('game.attack.rollHintCountered', { counter }) : t('game.attack.rollHint')}
            </p>
            <div className={dialog.actions}>
              <button className="primary" onClick={() => onAction({ type: 'ROLL_ATTACK' })}>{t('game.attack.roll')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
