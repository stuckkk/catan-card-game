import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CentralSlot, RegionState, GameAction, TurnPhase, ExpansionColor,
} from '../engine/types'
import { getCard } from '../engine/cards'
import RegionCard from './RegionCard'
import CardView from './CardView'
import CardDetail from './CardDetail'
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

type RegionCell = RegionState | undefined

/** Whether a green/red card being placed may go on this central slot's expansion slots. */
function slotAcceptsPlacing(slotKind: CentralSlot['kind'], placing: Placing): boolean {
  if (!placing) return false
  if (placing.color === 'green') return slotKind === 'settlement' || slotKind === 'city'
  if (placing.color === 'red') return slotKind === 'city'
  return false
}

/** Split a settlement/city's expansion slots into the above/below halves. */
function splitExpansions(slot: CentralSlot) {
  const half = Math.ceil(slot.expansionSlots.length / 2)
  return { aboveExp: slot.expansionSlots.slice(0, half), belowExp: slot.expansionSlots.slice(half) }
}

/** One expansion slot: a placed card, a clickable target while placing, or an empty cell. */
function ExpansionSlot({ cardId, slotIndex, expansionSlotIndex, placeableHere, placing, onAction, onInspect }: {
  cardId: string | null
  slotIndex: number
  expansionSlotIndex: number
  placeableHere: boolean
  placing: Placing
  onAction: (a: GameAction) => void
  onInspect: (cardId: string) => void
}) {
  const { t } = useTranslation()
  if (cardId) return <CardView cardId={cardId} compact onClick={() => onInspect(cardId)} />
  if (placeableHere && placing) {
    return (
      <button
        className={`${styles.emptyExp} ${styles.placeable}`}
        title={t(getCard(placing.cardId).nameKey)}
        onClick={() => onAction({
          type: 'PLACE_EXPANSION', cardId: placing.cardId, slotIndex, expansionSlotIndex,
        })}
      >
        +
      </button>
    )
  }
  return <div className={styles.emptyExp} />
}

/** The row of expansion slots above or below a settlement/city core. Rendered as its own
 *  shared grid row (see `board`'s render) rather than stacked with the core, so a
 *  settlement's core never shifts position when it's built or gains expansion cards —
 *  it stays fixed on the central axis, with buildings appearing between it and the regions. */
function SettlementExpansions({ slot, idx, side, placing, onAction, onInspect }: {
  slot: CentralSlot
  idx: number
  side: 'above' | 'below'
  placing: Placing
  onAction: (a: GameAction) => void
  onInspect: (cardId: string) => void
}) {
  if (slot.kind !== 'settlement' && slot.kind !== 'city') return null
  const { aboveExp, belowExp } = splitExpansions(slot)
  const cards = side === 'above' ? aboveExp : belowExp
  if (cards.length === 0) return null
  const offset = side === 'above' ? 0 : aboveExp.length
  const placeableHere = slotAcceptsPlacing(slot.kind, placing)

  return (
    <div className={styles.expansions}>
      {cards.map((cardId, i) => (
        <ExpansionSlot
          key={offset + i}
          cardId={cardId}
          slotIndex={idx}
          expansionSlotIndex={offset + i}
          placeableHere={placeableHere}
          placing={placing}
          onAction={onAction}
          onInspect={onInspect}
        />
      ))}
    </div>
  )
}

/** The settlement/city core box, or the build-settlement button. Fixed size and grid
 *  position regardless of how many expansion cards are built above/below it. */
function SettlementCore({ slot, idx, canBuild, onAction }: {
  slot: CentralSlot
  idx: number
  canBuild: boolean
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
        <span className={styles.buildIcon}>+</span> {t('cards.settlement.name')}
      </button>
    )
  }

  return (
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
  )
}

export default function Principality({
  principality, regions, isMyBoard, phase, isMyTurn, placingCardId, onAction,
}: Props) {
  const { t } = useTranslation()
  const canBuild = isMyBoard && isMyTurn && phase === 'action'

  // Card tapped on the board to inspect its effects/perks (view-only sheet).
  const [inspectCardId, setInspectCardId] = useState<string | null>(null)

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
      .map(ri => regions[ri])
      .filter((r): r is RegionState => !!r)
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
            <RegionCard region={cell} />
          </div>
        ))}

        {/* Expansions built above a settlement/city — sits between the top regions and the core */}
        {settlementSlots.map(({ slot, idx }, i) => (
          <div key={`ea${i}`} className={styles.expAboveCell} style={{ gridColumn: 2 * i + 2, gridRow: 2 }}>
            <SettlementExpansions slot={slot} idx={idx} side="above" placing={placing} onAction={onAction} onInspect={setInspectCardId} />
          </div>
        ))}

        {/* Central axis: settlement/city cores, fixed here regardless of expansions built */}
        {settlementSlots.map(({ slot, idx }, i) => (
          <div key={`s${i}`} className={styles.axisCell} style={{ gridColumn: 2 * i + 2, gridRow: 3 }}>
            <SettlementCore slot={slot} idx={idx} canBuild={canBuild} onAction={onAction} />
          </div>
        ))}

        {/* Roads sit in the shared column between two settlements, on the same axis row */}
        {Object.entries(roadByCol).map(([colStr, { slot, idx }]) => {
          const col = Number(colStr)
          return (
            <div key={`r${col}`} className={styles.axisCell} style={{ gridColumn: 2 * col + 1, gridRow: 3 }}>
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

        {/* Expansions built below a settlement/city — sits between the core and the bottom regions */}
        {settlementSlots.map(({ slot, idx }, i) => (
          <div key={`eb${i}`} className={styles.expBelowCell} style={{ gridColumn: 2 * i + 2, gridRow: 4 }}>
            <SettlementExpansions slot={slot} idx={idx} side="below" placing={placing} onAction={onAction} onInspect={setInspectCardId} />
          </div>
        ))}

        {/* Bottom regions */}
        {bottomRow.map((cell, j) => cell && (
          <div key={`b${j}`} className={styles.regionCell} style={{ gridColumn: 2 * j + 1, gridRow: 5 }}>
            <RegionCard region={cell} />
          </div>
        ))}

        {/* Extend the principality with a new road + settlement off the right flank */}
        {canBuild && (
          <div className={styles.axisCell} style={{ gridColumn: totalCols, gridRow: 3 }}>
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

      {inspectCardId && (
        <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />
      )}
    </div>
  )
}
