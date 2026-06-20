import { useTranslation } from 'react-i18next'
import type { CentralSlot, RegionState, GameAction, TurnPhase } from '../engine/types'
import RegionCard from './RegionCard'
import CardView from './CardView'
import styles from './Principality.module.css'

interface Props {
  principality: CentralSlot[]
  regions: RegionState[]
  isMyBoard: boolean
  phase: TurnPhase | undefined
  isMyTurn: boolean
  onAction: (a: GameAction) => void
}

function SlotLabel({ kind }: { kind: CentralSlot['kind'] }) {
  const { t } = useTranslation()
  const labels: Record<CentralSlot['kind'], string> = {
    road: t('cards.road.name'),
    'empty-road': '+Road',
    settlement: t('cards.settlement.name'),
    city: t('cards.city.name'),
    'empty-settlement': '+Settle',
  }
  return <span className={styles.slotLabel}>{labels[kind]}</span>
}

export default function Principality({
  principality, regions, isMyBoard, phase, isMyTurn, onAction,
}: Props) {
  function handleEmptySettlement(idx: number) {
    if (!isMyBoard || !isMyTurn || phase !== 'action') return
    onAction({ type: 'BUILD_SETTLEMENT', slotIndex: idx })
  }

  function handleEmptyRoad(idx: number) {
    if (!isMyBoard || !isMyTurn || phase !== 'action') return
    onAction({ type: 'BUILD_ROAD', slotIndex: idx })
  }

  function handleUpgradeCity(idx: number) {
    if (!isMyBoard || !isMyTurn || phase !== 'action') return
    onAction({ type: 'BUILD_CITY', slotIndex: idx })
  }

  return (
    <div className={styles.principality}>
      {/* Central Axis */}
      <div className={styles.axis}>
        {principality.map((slot, idx) => (
          <div key={idx} className={[styles.axisSlot, styles[slot.kind]].join(' ')}>
            <SlotLabel kind={slot.kind} />

            {slot.kind === 'empty-road' && isMyBoard && isMyTurn && (
              <button className={styles.buildBtn} onClick={() => handleEmptyRoad(idx)}>+</button>
            )}

            {slot.kind === 'settlement' && isMyBoard && isMyTurn && (
              <button className={styles.upgradeBtn} onClick={() => handleUpgradeCity(idx)}>⬆</button>
            )}

            {slot.kind === 'empty-settlement' && isMyBoard && isMyTurn && (
              <button className={styles.buildBtn} onClick={() => handleEmptySettlement(idx)}>+</button>
            )}

            {/* Expansion slots */}
            {slot.expansionSlots.length > 0 && (
              <div className={styles.expansionSlots}>
                {slot.expansionSlots.map((cardId, eIdx) =>
                  cardId
                    ? <CardView key={eIdx} cardId={cardId} compact />
                    : <div key={eIdx} className={styles.emptyExpansion} />
                )}
              </div>
            )}
          </div>
        ))}

        {/* Extend road button at the end */}
        {isMyBoard && isMyTurn && phase === 'action' && (
          <button
            className={styles.buildBtn}
            onClick={() => onAction({ type: 'BUILD_ROAD', slotIndex: principality.length })}
          >+Road</button>
        )}
      </div>

      {/* Regions */}
      <div className={styles.regions}>
        {regions.map((region, idx) => (
          <RegionCard key={idx} region={region} />
        ))}
      </div>
    </div>
  )
}
