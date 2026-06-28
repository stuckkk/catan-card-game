import { useTranslation } from 'react-i18next'
import type {
  CentralSlot, RegionState, GameAction, TurnPhase, ExpansionColor, RegionExpansionPosition,
} from '../engine/types'
import { getCard } from '../engine/cards'
import RegionCard from './RegionCard'
import CardView from './CardView'
import styles from './Principality.module.css'

/** The expansion card currently being placed (card-first flow), with its resolved colour. */
type Placing = { cardId: string; color: ExpansionColor } | null

interface Props {
  principality: CentralSlot[]
  regions: RegionState[]
  isMyBoard: boolean
  phase: TurnPhase | undefined
  isMyTurn: boolean
  /** Expansion card the player is currently placing, or null when not placing. */
  placingCardId: string | null
  onAction: (a: GameAction) => void
}

type RegionCell = { region: RegionState; regionIndex: number } | undefined

/** Whether a green/red card being placed may go on this central slot's expansion slots. */
function slotAcceptsPlacing(slotKind: CentralSlot['kind'], placing: Placing): boolean {
  if (!placing) return false
  if (placing.color === 'green') return slotKind === 'settlement' || slotKind === 'city'
  if (placing.color === 'red') return slotKind === 'city'
  return false  // brown goes on regions, not central slots
}

/** The settlement/city core plus its expansion slots, stacked vertically in the axis row. */
function SettlementCell({ slot, idx, canBuild, placing, onAction }: {
  slot: CentralSlot
  idx: number
  canBuild: boolean
  placing: Placing
  onAction: (a: GameAction) => void
}) {
  const { t } = useTranslation()

  if (slot.kind === 'empty-settlement') {
    return (
      <button
        className={styles.buildSettlement}
        disabled={!canBuild}
        onClick={() => onAction({ type: 'BUILD_SETTLEMENT', slotIndex: idx })}
      >
        + {t('cards.settlement.name')}
      </button>
    )
  }

  const half = Math.ceil(slot.expansionSlots.length / 2)
  const placeableHere = slotAcceptsPlacing(slot.kind, placing)

  // Render one expansion slot: a placed card, a clickable target while placing, or an empty cell.
  // `expansionSlotIndex` is the card's real index in slot.expansionSlots.
  const renderExp = (cardId: string | null, expansionSlotIndex: number) => {
    if (cardId) return <CardView key={expansionSlotIndex} cardId={cardId} compact />
    if (placeableHere && placing) {
      return (
        <button
          key={expansionSlotIndex}
          className={`${styles.emptyExp} ${styles.placeable}`}
          title={t(getCard(placing.cardId).nameKey)}
          onClick={() => onAction({
            type: 'PLACE_EXPANSION', cardId: placing.cardId, slotIndex: idx, expansionSlotIndex,
          })}
        >
          +
        </button>
      )
    }
    return <div key={expansionSlotIndex} className={styles.emptyExp} />
  }

  const aboveExp = slot.expansionSlots.slice(0, half)
  const belowExp = slot.expansionSlots.slice(half)

  return (
    <div className={styles.settlementCell}>
      {aboveExp.length > 0 && (
        <div className={styles.expansions}>
          {aboveExp.map((cardId, i) => renderExp(cardId, i))}
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
          {belowExp.map((cardId, i) => renderExp(cardId, half + i))}
        </div>
      )}
    </div>
  )
}

/** A region card with its brown above/below expansion slots, supporting brown placement. */
function RegionWithExpansions({ region, regionIndex, placing, onAction }: {
  region: RegionState
  regionIndex: number
  placing: Placing
  onAction: (a: GameAction) => void
}) {
  const { t } = useTranslation()
  const placeable = placing?.color === 'brown'

  const renderRegionExp = (cardId: string | null, position: RegionExpansionPosition) => {
    if (cardId) return <CardView cardId={cardId} compact />
    if (placeable && placing) {
      return (
        <button
          className={`${styles.emptyExp} ${styles.placeable}`}
          title={t(getCard(placing.cardId).nameKey)}
          onClick={() => onAction({
            type: 'PLACE_REGION_EXPANSION', cardId: placing.cardId, regionIndex, position,
          })}
        >
          +
        </button>
      )
    }
    return null
  }

  return (
    <div className={styles.regionStack}>
      <div className={styles.regionExp}>{renderRegionExp(region.expansionAbove, 'above')}</div>
      <RegionCard region={region} />
      <div className={styles.regionExp}>{renderRegionExp(region.expansionBelow, 'below')}</div>
    </div>
  )
}

export default function Principality({
  principality, regions, isMyBoard, phase, isMyTurn, placingCardId, onAction,
}: Props) {
  const { t } = useTranslation()
  const canBuild = isMyBoard && isMyTurn && phase === 'action'

  // Resolve the card being placed (card-first flow) to its colour for valid-slot highlighting.
  const placingCard = placingCardId ? getCard(placingCardId) : null
  const placing: Placing = placingCard?.expansionColor
    ? { cardId: placingCardId as string, color: placingCard.expansionColor }
    : null

  // Settlement-bearing slots in axis order; everything else on the axis is a road.
  const settlementSlots = principality
    .map((slot, idx) => ({ slot, idx }))
    .filter(({ slot }) => slot.kind !== 'road' && slot.kind !== 'empty-road')

  const settCount = settlementSlots.length
  const regionCols = settCount + 1

  // Lay the regions into a shared top/bottom grid. Each settlement i borders the
  // region columns i (left) and i+1 (right); the column *between* two settlements
  // is shared, so each settlement's regions read diagonally off it — matching the
  // physical board. Fill order leftTop → leftBottom → rightTop → rightBottom,
  // skipping cells a neighbouring settlement already claimed.
  const topRow: RegionCell[] = Array(regionCols).fill(undefined)
  const bottomRow: RegionCell[] = Array(regionCols).fill(undefined)

  settlementSlots.forEach(({ slot }, i) => {
    const regs = slot.regionIndices
      .map(ri => ({ region: regions[ri], regionIndex: ri }))
      .filter(r => r.region) as { region: RegionState; regionIndex: number }[]
    const targets: [RegionCell[], number][] = [
      [topRow, i], [bottomRow, i], [topRow, i + 1], [bottomRow, i + 1],
    ]
    let ti = 0
    for (const r of regs) {
      while (ti < targets.length && targets[ti][0][targets[ti][1]] !== undefined) ti++
      if (ti >= targets.length) break
      targets[ti][0][targets[ti][1]] = r
      ti++
    }
  })

  // Map each road slot to the region column between its flanking settlements.
  const roadByCol: Record<number, { slot: CentralSlot; idx: number }> = {}
  let settOrder = -1
  principality.forEach((slot, idx) => {
    if (slot.kind !== 'road' && slot.kind !== 'empty-road') {
      settOrder++
      return
    }
    roadByCol[settOrder + 1] = { slot, idx }
  })

  const totalCols = 2 * settCount + 1

  return (
    <div className={styles.board}>
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${totalCols}, var(--card-w))` }}
      >
        {/* Top regions */}
        {topRow.map((cell, j) => cell && (
          <div key={`t${j}`} className={styles.regionCell} style={{ gridColumn: 2 * j + 1, gridRow: 1 }}>
            <RegionWithExpansions region={cell.region} regionIndex={cell.regionIndex} placing={placing} onAction={onAction} />
          </div>
        ))}

        {/* Central axis: settlements/cities */}
        {settlementSlots.map(({ slot, idx }, i) => (
          <div key={`s${i}`} className={styles.axisCell} style={{ gridColumn: 2 * i + 2, gridRow: 2 }}>
            <SettlementCell slot={slot} idx={idx} canBuild={canBuild} placing={placing} onAction={onAction} />
          </div>
        ))}

        {/* Roads sit in the shared column between two settlements */}
        {Object.entries(roadByCol).map(([colStr, { slot, idx }]) => {
          const col = Number(colStr)
          return (
            <div key={`r${col}`} className={styles.axisCell} style={{ gridColumn: 2 * col + 1, gridRow: 2 }}>
              {slot.kind === 'empty-road' ? (
                <button
                  className={styles.buildRoad}
                  disabled={!canBuild}
                  title={t('cards.road.name')}
                  onClick={() => onAction({ type: 'BUILD_ROAD', slotIndex: idx })}
                >
                  +
                </button>
              ) : (
                <div className={styles.road} title={t('cards.road.name')} />
              )}
            </div>
          )
        })}

        {/* Bottom regions */}
        {bottomRow.map((cell, j) => cell && (
          <div key={`b${j}`} className={styles.regionCell} style={{ gridColumn: 2 * j + 1, gridRow: 3 }}>
            <RegionWithExpansions region={cell.region} regionIndex={cell.regionIndex} placing={placing} onAction={onAction} />
          </div>
        ))}

        {/* Extend the principality with a new road + settlement off the right flank */}
        {canBuild && (
          <div className={styles.axisCell} style={{ gridColumn: totalCols, gridRow: 2 }}>
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
