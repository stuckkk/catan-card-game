import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CardView from './CardView'
import CardDetail from './CardDetail'
import ActionCardDialog from './ActionCardDialog'
import type { GameAction, TurnPhase, Resources } from '../engine/types'
import { getCard } from '../engine/cards'
import styles from './Hand.module.css'

interface Props {
  cardIds: string[]
  isMyTurn: boolean
  phase: TurnPhase | undefined
  resources: Resources | undefined
  opponentResources: Resources | undefined
  /** The Black Knight can only be played against a Knight. */
  opponentHasKnight: boolean
  /** Both players together have at least 7 VP. */
  actionsUnlocked: boolean
  onAction: (a: GameAction) => void
  /** Begin placing an expansion card on the board (card-first placement flow). */
  onBeginPlacement: (cardId: string) => void
}

function canAffordCard(resources: Resources, cardId: string): boolean {
  const def = getCard(cardId)
  if (!def.cost) return true
  return Object.entries(def.cost).every(([r, amount]) =>
    resources[r as keyof Resources] >= (amount ?? 0)
  )
}

type ParamCard = 'alchemist' | 'caravan' | 'merchant'

export default function Hand({
  cardIds, isMyTurn, phase, resources, opponentResources, opponentHasKnight, actionsUnlocked, onAction, onBeginPlacement,
}: Props) {
  const { t } = useTranslation()
  // Index (not id) so duplicate cards open the one actually tapped.
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState<ParamCard | null>(null)

  const canAct = isMyTurn && phase === 'action'
  const openId = openIndex != null ? cardIds[openIndex] : null
  const openDef = openId ? getCard(openId) : null
  const openAffordable = openId && resources ? canAffordCard(resources, openId) : false

  // Why an action card can't be played right now (null = playable).
  let actionNote: string | null = null
  let canPlay = false
  if (openDef?.category === 'action') {
    const timingOk = isMyTurn && (openDef.id === 'alchemist' ? phase === 'roll' : phase === 'action')
    if (openDef.notImplemented) actionNote = t('game.notImplemented')
    else if (openDef.id === 'scout') actionNote = t('game.scoutOnlyOnBuild')
    else if (openDef.id === 'herb-woman') actionNote = t('game.herbWomanOnlyAsCounter')
    else if (!actionsUnlocked) actionNote = t('game.actionLocked')
    else if (openDef.id === 'black-knight' && !opponentHasKnight) actionNote = t('game.blackKnight.noTarget')
    else canPlay = timingOk
  }

  function handlePlay(id: string) {
    // The Black Knight needs no parameters: the engine runs the duel with prompts of its own.
    if (id === 'black-knight') onAction({ type: 'PLAY_ACTION_CARD', cardId: id })
    else setPlaying(id as ParamCard)
    setOpenIndex(null)
  }

  function handleBuild(id: string) {
    onBeginPlacement(id)
    setOpenIndex(null)
  }

  if (cardIds.length === 0) {
    return <p className={styles.empty}>{t('game.handSize', { count: 0 })}</p>
  }

  return (
    <div className={styles.hand}>
      <div className={styles.cards} data-testid="hand-cards">
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
          canPlay={canPlay}
          canBuild={canAct && openDef.category === 'expansion'}
          affordable={openDef.category === 'action' ? true : openAffordable}
          note={actionNote}
          resources={resources}
          onPlay={() => handlePlay(openId)}
          onBuild={() => handleBuild(openId)}
          onClose={() => setOpenIndex(null)}
        />
      )}

      {playing && resources && opponentResources && (
        <ActionCardDialog
          cardId={playing}
          myResources={resources}
          opponentResources={opponentResources}
          onAction={onAction}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  )
}
