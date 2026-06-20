import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CardView from './CardView'
import type { GameAction, TurnPhase, Resources } from '../engine/types'
import { getCard } from '../engine/cards'
import styles from './Hand.module.css'

interface Props {
  cardIds: string[]
  isMyTurn: boolean
  phase: TurnPhase | undefined
  resources: Resources | undefined
  onAction: (a: GameAction) => void
}

function canAffordCard(resources: Resources, cardId: string): boolean {
  const def = getCard(cardId)
  if (!def.cost) return true
  return Object.entries(def.cost).every(([r, amount]) =>
    resources[r as keyof Resources] >= (amount ?? 0)
  )
}

export default function Hand({ cardIds, isMyTurn, phase, resources, onAction }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(null)

  const canPlay = isMyTurn && phase === 'action'

  function handleCardClick(id: string) {
    if (!canPlay) return
    setSelected(prev => prev === id ? null : id)
  }

  function handlePlayAction(id: string) {
    onAction({ type: 'PLAY_ACTION_CARD', cardId: id })
    setSelected(null)
  }

  if (cardIds.length === 0) {
    return <p className={styles.empty}>{t('game.handSize', { count: 0 })}</p>
  }

  return (
    <div className={styles.hand}>
      <div className={styles.cards}>
        {cardIds.map((id, idx) => {
          const def = getCard(id)
          const affordable = resources ? canAffordCard(resources, id) : false
          return (
            <div key={`${id}-${idx}`} className={styles.cardWrap}>
              <CardView
                cardId={id}
                selected={selected === id}
                affordable={canPlay ? affordable : true}
                onClick={() => handleCardClick(id)}
              />
              {selected === id && def.category === 'action' && (
                <button className="primary" onClick={() => handlePlayAction(id)}>
                  {t('game.rollDice').replace('Roll', 'Play')}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
