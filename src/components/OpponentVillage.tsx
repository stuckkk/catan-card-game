import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CentralSlot, RegionState } from '../engine/types'
import Principality from './Principality'
import { useDialog } from './useDialog'
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
          <div className={styles.thumbnailScale}>
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
        <button
          className={styles.thumbnailButton}
          aria-label={t('game.viewOpponentVillage')}
          title={t('game.viewOpponentVillage')}
          onClick={() => setIsOpen(true)}
        />
      </div>

      {isOpen && <VillageDialog principality={principality} regions={regions} onClose={() => setIsOpen(false)} />}
    </>
  )
}

function VillageDialog({ principality, regions, onClose }: Props & { onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useDialog<HTMLDivElement>(onClose)
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        ref={ref}
        tabIndex={-1}
        style={{ outline: 'none' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('game.opponentVillage')}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{t('game.opponentVillage')}</h3>
          <button className="secondary" onClick={onClose}>{t('card.close')}</button>
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
  )
}
