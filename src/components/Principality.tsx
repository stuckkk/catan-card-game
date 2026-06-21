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

interface UnitProps {
  slot: CentralSlot
  idx: number
  regions: RegionState[]
  canBuild: boolean
  onAction: (a: GameAction) => void
}

/** One Settlement/City column: regions diagonally above & below, expansion slots in between. */
function SettlementUnit({ slot, idx, regions, canBuild, onAction }: UnitProps) {
  const { t } = useTranslation()

  if (slot.kind === 'empty-settlement') {
    return (
      <div className={styles.unit}>
        <button
          className={styles.buildSettlement}
          disabled={!canBuild}
          onClick={() => onAction({ type: 'BUILD_SETTLEMENT', slotIndex: idx })}
        >
          + {t('cards.settlement.name')}
        </button>
      </div>
    )
  }

  const half = Math.ceil(slot.expansionSlots.length / 2)
  const aboveExp = slot.expansionSlots.slice(0, half)
  const belowExp = slot.expansionSlots.slice(half)
  const regs = slot.regionIndices.map(i => regions[i]).filter(Boolean) as RegionState[]
  const topRegions = regs.slice(0, 2)
  const bottomRegions = regs.slice(2)

  return (
    <div className={styles.unit}>
      <div className={`${styles.regionRow} ${styles.top}`}>
        {topRegions.map((r, i) => <RegionCard key={i} region={r} />)}
      </div>

      {aboveExp.length > 0 && (
        <div className={styles.expansions}>
          {aboveExp.map((cardId, i) =>
            cardId
              ? <CardView key={i} cardId={cardId} compact />
              : <div key={i} className={styles.emptyExp} />
          )}
        </div>
      )}

      <div className={`${styles.core} ${styles[slot.kind]}`}>
        <span className={styles.coreLabel}>{t(`cards.${slot.kind}.name`)}</span>
        {slot.kind === 'settlement' && canBuild && (
          <button
            className={styles.upgradeBtn}
            title={t('cards.city.name')}
            onClick={() => onAction({ type: 'BUILD_CITY', slotIndex: idx })}
          >
            ⬆ {t('cards.city.name')}
          </button>
        )}
      </div>

      {belowExp.length > 0 && (
        <div className={styles.expansions}>
          {belowExp.map((cardId, i) =>
            cardId
              ? <CardView key={i} cardId={cardId} compact />
              : <div key={i} className={styles.emptyExp} />
          )}
        </div>
      )}

      <div className={`${styles.regionRow} ${styles.bottom}`}>
        {bottomRegions.map((r, i) => <RegionCard key={i} region={r} />)}
      </div>
    </div>
  )
}

function RoadConnector({ slot, idx, canBuild, onAction }: Omit<UnitProps, 'regions'>) {
  const { t } = useTranslation()
  if (slot.kind === 'empty-road') {
    return (
      <div className={styles.roadWrap}>
        <button
          className={styles.buildRoad}
          disabled={!canBuild}
          title={t('cards.road.name')}
          onClick={() => onAction({ type: 'BUILD_ROAD', slotIndex: idx })}
        >
          +
        </button>
      </div>
    )
  }
  return (
    <div className={styles.roadWrap}>
      <div className={styles.road} title={t('cards.road.name')} />
    </div>
  )
}

export default function Principality({
  principality, regions, isMyBoard, phase, isMyTurn, onAction,
}: Props) {
  const { t } = useTranslation()
  const canBuild = isMyBoard && isMyTurn && phase === 'action'

  return (
    <div className={styles.board}>
      <div className={styles.axis}>
        {principality.map((slot, idx) =>
          slot.kind === 'road' || slot.kind === 'empty-road'
            ? <RoadConnector key={idx} slot={slot} idx={idx} canBuild={canBuild} onAction={onAction} />
            : <SettlementUnit key={idx} slot={slot} idx={idx} regions={regions} canBuild={canBuild} onAction={onAction} />
        )}

        {canBuild && (
          <div className={styles.roadWrap}>
            <button
              className={styles.buildRoad}
              title={t('cards.road.name')}
              onClick={() => onAction({ type: 'BUILD_ROAD', slotIndex: principality.length })}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
