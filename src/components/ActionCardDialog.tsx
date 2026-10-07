import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameAction, ProductionNumber, ResourceType, Resources } from '../engine/types'
import ResourcePicker from './ResourcePicker'
import { RESOURCE_ORDER } from './resourceMeta'
import styles from './Dialog.module.css'
import panel from './Panel.module.css'

interface Props {
  cardId: 'alchemist' | 'caravan' | 'merchant'
  myResources: Resources
  opponentResources: Resources
  /** Free Region room per type: the Merchant only moves resources the receiver has room for. */
  myRoom: Resources
  opponentRoom: Resources
  onAction: (a: GameAction) => void
  onClose: () => void
}

/** Collects the choices an Action Card needs before it is played. */
export default function ActionCardDialog({ cardId, myResources, opponentResources, myRoom, opponentRoom, onAction, onClose }: Props) {
  const { t } = useTranslation()
  const [first, setFirst] = useState<ResourceType[]>([])
  const [second, setSecond] = useState<ResourceType[]>([])

  function play(params: NonNullable<Extract<GameAction, { type: 'PLAY_ACTION_CARD' }>['params']>) {
    onAction({ type: 'PLAY_ACTION_CARD', cardId, params })
    onClose()
  }

  // Merchant: take what the opponent holds and I have room for; give back what I hold after the
  // take and the opponent has room for (the take frees room on their side).
  const takeable = { ...opponentResources }
  const givable = { ...myResources }
  for (const r of RESOURCE_ORDER) {
    const taken = first.filter(x => x === r).length
    takeable[r] = Math.min(opponentResources[r], myRoom[r])
    givable[r] = Math.min(myResources[r] + taken, opponentRoom[r] + taken)
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {cardId === 'alchemist' && (
          <>
            <div className={styles.title}>{t('game.alchemist.title')}</div>
            <div className={panel.row}>
              {([1, 2, 3, 4, 5, 6] as ProductionNumber[]).map(n => (
                <button key={n} className={panel.deckChip} onClick={() => play({ productionNumber: n })}>{n}</button>
              ))}
            </div>
          </>
        )}

        {cardId === 'caravan' && (
          <>
            <div className={styles.title}>{t('game.caravan.title')}</div>
            <ResourcePicker label={t('game.caravan.give')} max={2} available={myResources} value={first} onChange={setFirst} />
            <ResourcePicker label={t('game.caravan.receive')} max={first.length} value={second} onChange={setSecond} />
          </>
        )}

        {cardId === 'merchant' && (
          <>
            <div className={styles.title}>{t('game.merchant.title')}</div>
            <ResourcePicker label={t('game.merchant.take')} max={2} available={takeable} value={first}
              onChange={v => { setFirst(v); setSecond([]) }} />
            <ResourcePicker label={t('game.merchant.give')} max={1} available={givable} value={second} onChange={setSecond} />
          </>
        )}

        <div className={styles.actions}>
          <button className="secondary" onClick={onClose}>{t('game.cancel')}</button>
          {cardId !== 'alchemist' && (
            <button
              className="primary"
              disabled={cardId === 'caravan'
                ? first.length === 0 || second.length !== first.length
                : first.length === 0 || second.length !== 1}
              onClick={() => play(cardId === 'caravan' ? { give: first, receive: second } : { take: first, give: second })}
            >
              {t('game.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
