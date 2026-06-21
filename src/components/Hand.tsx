import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CardView from './CardView'
import CardDetail from './CardDetail'
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
  // Index (not id) so duplicate cards open the one actually tapped.
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const canAct = isMyTurn && phase === 'action'
  const openId = openIndex != null ? cardIds[openIndex] : null
  const openDef = openId ? getCard(openId) : null
  const openAffordable = openId && resources ? canAffordCard(resources, openId) : false

  function handlePlay(id: string) {
    onAction({ type: 'PLAY_ACTION_CARD', cardId: id })
    setOpenIndex(null)
  }

  if (cardIds.length === 0) {
    return <p className={styles.empty}>{t('game.handSize', { count: 0 })}</p>
  }

  return (
    <div className={styles.hand}>
      <div className={styles.cards}>
        {cardIds.map((id, idx) => {
          const affordable = resources ? canAffordCard(resources, id) : false
          return (
            <CardView
              key={`${id}-${idx}`}
              cardId={id}
              affordable={canAct ? affordable : true}
              onClick={() => setOpenIndex(idx)}
            />
          )
        })}
      </div>

      {openId && openDef && (
        <CardDetail
          cardId={openId}
          canPlay={canAct && openDef.category === 'action'}
          affordable={openAffordable}
          onPlay={() => handlePlay(openId)}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  )
}
