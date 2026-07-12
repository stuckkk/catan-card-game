import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CentralSlot, RegionState } from '../engine/types'
import Principality from './Principality'
import styles from './OpponentVillage.module.css'

interface Props {
  principality: CentralSlot[]
  regions: RegionState[]
}

export default function OpponentVillage({ principality, regions }: Props) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <div className={styles.thumbnail}>
        <div className={styles.thumbnailBoard}>
          <Principality
            principality={principality}
            regions={regions}
            isMyBoard={false}
            phase={undefined}
            isMyTurn={false}
            placingCardId={null}
            onAction={() => {}}
          />
        </div>
        <button
          className={styles.thumbnailButton}
          aria-label={t('game.viewOpponentVillage')}
          title={t('game.viewOpponentVillage')}
          onClick={() => setIsOpen(true)}
        />
      </div>

      {isOpen && (
        <div className={styles.backdrop} onClick={() => setIsOpen(false)}>
          <div
            className={styles.sheet}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('game.opponentVillage')}
          >
            <div className={styles.header}>
              <h3 className={styles.title}>{t('game.opponentVillage')}</h3>
              <button className="secondary" onClick={() => setIsOpen(false)}>{t('card.close')}</button>
            </div>
            <div className={styles.boardWrap}>
              <Principality
                principality={principality}
                regions={regions}
                isMyBoard={false}
                phase={undefined}
                isMyTurn={false}
                placingCardId={null}
                onAction={() => {}}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
