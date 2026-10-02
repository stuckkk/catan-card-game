import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CentralSlot, RegionState, GameAction, TurnPhase, ExpansionColor, Resources, Supply,
} from '../engine/types'
import { getCard } from '../engine/cards'
import { canAfford } from '../engine/board'
import { getRegion } from '../engine/regions'
import RegionCard from './RegionCard'
import CardView from './CardView'
import CardDetail from './CardDetail'
import BuildConfirmDialog from './BuildConfirmDialog'
import styles from './Principality.module.css'
import dialog from './Dialog.module.css'
import panel from './Panel.module.css'

/** The expansion card currently being placed (card-first flow), with its resolved colour. */
type Placing = { cardId: string; color: ExpansionColor } | null

type BuildKind = 'road' | 'settlement' | 'city'
/** A Road/Settlement/City build waiting for the player's confirmation. */
type PendingBuild = { kind: BuildKind; action: GameAction }

interface Props {
  principality: CentralSlot[]
  regions: RegionState[]
  isMyBoard: boolean
  phase: TurnPhase | undefined
  isMyTurn: boolean
  /** Expansion card the player is currently placing, or null when not placing. */
  placingCardId: string | null
  onAction: (a: GameAction) => void
  /** Setup: the starting regions may be swapped by tapping two of them. */
  canArrange?: boolean
  /** A Scout is in hand: offer building a settlement with it. */
  hasScout?: boolean
  /** Region stack composition, for the Scout picker. */
  regionStack?: string[]
  /** The owner's spendable resources, to check build costs before confirming. */
  resources?: Resources
  /** Development Cards left in the shared supply. */
  supply?: Supply
  /** The latest production (log id and number rolled), to make the producing regions glow. */
  production?: { id: string; roll: number } | null
}

type RegionCell = { region: RegionState; index: number } | undefined

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

/** Scout: choose the regions above and below a new settlement from the Region stack. */
function ScoutPicker({ regionStack, onPick, onClose }: {
  regionStack: string[]
  onPick: (ids: [string, string]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<string[]>([])
  return (
    <div className={dialog.backdrop} onClick={onClose}>
      <div className={dialog.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={dialog.title}>{t('game.scout.title')}</div>
        <div className={panel.cards}>
          {regionStack.map(id => {
            const def = getRegion(id)
            const at = picked.indexOf(id)
            return (
              <button
                key={id}
                className={`${panel.cardChip} ${at >= 0 ? panel.selected : ''}`}
                disabled={at < 0 && picked.length >= 2}
                onClick={() => setPicked(p => (at >= 0 ? p.filter(x => x !== id) : [...p, id]))}
              >
                {t(def.nameKey)} {def.productionNumber}
                {at >= 0 && <span className={panel.deckCount}>{at === 0 ? t('game.regionAbove') : t('game.regionBelow')}</span>}
              </button>
            )
          })}
        </div>
        <div className={dialog.actions}>
          <button className="secondary" onClick={onClose}>{t('game.cancel')}</button>
          <button className="primary" disabled={picked.length !== 2} onClick={() => onPick(picked as [string, string])}>
            {t('game.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The settlement/city core box, or the build-settlement button(s). Fixed size and grid
 *  position regardless of how many expansion cards are built above/below it. */
function SettlementCore({ slot, idx, canBuild, hasScout, regionStack, isReady, onRequestBuild, onAction }: {
  slot: CentralSlot
  idx: number
  canBuild: boolean
  hasScout: boolean
  regionStack: string[]
  /** Whether a build of this kind is affordable and allowed right now. */
  isReady: (kind: BuildKind) => boolean
  /** Ask for confirmation (or explain what's missing) before building. */
  onRequestBuild: (kind: BuildKind, action: GameAction) => void
  onAction: (a: GameAction) => void
}) {
  const { t } = useTranslation()
  const [scouting, setScouting] = useState(false)

  if (slot.kind === 'empty-settlement') {
    return (
      <div className={styles.buildStack}>
        <button
          className={`${styles.buildSettlement} ${canBuild && !isReady('settlement') ? styles.unaffordable : ''}`}
          disabled={!canBuild}
          onClick={() => onRequestBuild('settlement', { type: 'BUILD_SETTLEMENT', slotIndex: idx })}
        >
          <span className={styles.buildIcon}>+</span>
          <span>{t('cards.settlement.name')}</span>
        </button>
        {canBuild && hasScout && (
          <button
            className={`${styles.buildSettlement} ${isReady('settlement') ? '' : styles.unaffordable}`}
            onClick={() => {
              // The Scout picker is the confirmation; if the build can't happen, explain why instead.
              if (isReady('settlement')) setScouting(true)
              else onRequestBuild('settlement', { type: 'BUILD_SETTLEMENT', slotIndex: idx })
            }}
          >
            {t('game.scout.build')}
          </button>
        )}
        {scouting && (
          <ScoutPicker
            regionStack={regionStack}
            onClose={() => setScouting(false)}
            onPick={ids => { onAction({ type: 'BUILD_SETTLEMENT', slotIndex: idx, scoutRegionIds: ids }); setScouting(false) }}
          />
        )}
      </div>
    )
  }

  return (
    <div className={`${styles.core} ${styles[slot.kind]}`}>
      <span className={styles.coreIcon} aria-hidden="true">{slot.kind === 'city' ? '🏰' : '🏠'}</span>
      <span className={styles.coreLabel}>{t(`cards.${slot.kind}.name`)}</span>
      {slot.kind === 'settlement' && canBuild && (
        <button
          className={`${styles.upgradeBtn} ${isReady('city') ? '' : styles.unaffordable}`}
          title={t('cards.city.name')}
          onClick={() => onRequestBuild('city', { type: 'BUILD_CITY', slotIndex: idx })}
        >
          + {t('cards.city.name')}
        </button>
      )}
    </div>
  )
}

export default function Principality({
  principality, regions, isMyBoard, phase, isMyTurn, placingCardId, onAction,
  canArrange = false, hasScout = false, regionStack = [], resources, supply, production,
}: Props) {
  const { t } = useTranslation()
  const canBuild = isMyBoard && isMyTurn && phase === 'action'

  // Card tapped on the board to inspect its effects/perks (view-only sheet).
  const [inspectCardId, setInspectCardId] = useState<string | null>(null)
  // Setup: the first region tapped for a swap.
  const [swapFrom, setSwapFrom] = useState<number | null>(null)
  const [pendingBuild, setPendingBuild] = useState<PendingBuild | null>(null)

  /** Why a build is impossible regardless of resources, or null. */
  function buildBlocker(kind: BuildKind): string | null {
    if (supply && supply[kind] <= 0) return t('game.buildConfirm.noSupply', { name: t(`cards.${kind}.name`) })
    // A new Settlement takes 2 Regions from the stack (with or without a Scout).
    if (kind === 'settlement' && regionStack.length < 2) return t('game.buildConfirm.noRegions')
    return null
  }
  const isReady = (kind: BuildKind) =>
    !!resources && canAfford(resources, getCard(kind).cost ?? {}) && !buildBlocker(kind)

  // Resolve the card being placed (card-first flow) to its colour for valid-slot highlighting.
  const placingCard = placingCardId ? getCard(placingCardId) : null
  const placing: Placing = placingCard?.expansionColor
    ? { cardId: placingCardId as string, color: placingCard.expansionColor }
    : null

  // The axis alternates settlement sites (even indices) and roads (odd indices). Settlement
  // site k sits in grid column 2k+2; region column j (between sites j-1 and j) in 2j+1, where
  // the road between them also sits.
  const settlementSlots = principality
    .map((slot, idx) => ({ slot, idx }))
    .filter(({ slot }) => slot.kind !== 'road')
  const settCount = settlementSlots.length
  const totalCols = 2 * settCount + 1

  // Each built settlement lists its corners [topLeft, bottomLeft, topRight, bottomRight];
  // neighbours share the corners between them.
  const topRow: RegionCell[] = Array(settCount + 1).fill(undefined)
  const bottomRow: RegionCell[] = Array(settCount + 1).fill(undefined)
  settlementSlots.forEach(({ slot }, k) => {
    const [tl, bl, tr, br] = slot.regionIndices
    const cell = (i: number | undefined): RegionCell => (i != null && regions[i] ? { region: regions[i], index: i } : undefined)
    topRow[k] ??= cell(tl)
    bottomRow[k] ??= cell(bl)
    topRow[k + 1] ??= cell(tr)
    bottomRow[k + 1] ??= cell(br)
  })

  const canExtend = (slot: CentralSlot | undefined) => canBuild && !!slot && (slot.kind === 'settlement' || slot.kind === 'city')

  function regionCard(cell: NonNullable<RegionCell>) {
    // Only the 6 starting regions are arranged during setup.
    const swappable = canArrange && cell.index < 6
    return (
      <RegionCard
        region={cell.region}
        selected={swappable && swapFrom === cell.index}
        producedKey={production && getRegion(cell.region.regionId).productionNumber === production.roll ? production.id : undefined}
        onClick={swappable ? () => {
          if (swapFrom == null) setSwapFrom(cell.index)
          else {
            if (swapFrom !== cell.index) onAction({ type: 'SWAP_STARTING_REGIONS', a: swapFrom, b: cell.index })
            setSwapFrom(null)
          }
        } : undefined}
      />
    )
  }

  return (
    <div className={styles.board} style={{ '--cols': totalCols } as React.CSSProperties}>
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${totalCols}, var(--card-w))` }}
      >
        {/* Top regions */}
        {topRow.map((cell, j) => cell && (
          <div key={`t${j}`} className={styles.regionCell} style={{ gridColumn: 2 * j + 1, gridRow: 1 }}>
            {regionCard(cell)}
          </div>
        ))}

        {/* Expansions built above a settlement/city — sits between the top regions and the core */}
        {settlementSlots.map(({ slot, idx }, k) => (
          <div key={`ea${k}`} className={styles.expAboveCell} style={{ gridColumn: 2 * k + 2, gridRow: 2 }}>
            <SettlementExpansions slot={slot} idx={idx} side="above" placing={placing} onAction={onAction} onInspect={setInspectCardId} />
          </div>
        ))}

        {/* Central axis: settlement/city cores, fixed here regardless of expansions built */}
        {settlementSlots.map(({ slot, idx }, k) => (
          <div key={`s${k}`} className={styles.axisCell} style={{ gridColumn: 2 * k + 2, gridRow: 3 }}>
            <SettlementCore
              slot={slot} idx={idx} canBuild={canBuild} hasScout={hasScout} regionStack={regionStack}
              isReady={isReady} onRequestBuild={(kind, action) => setPendingBuild({ kind, action })} onAction={onAction}
            />
          </div>
        ))}

        {/* Roads sit in the shared column between two settlement sites */}
        {principality.map((slot, idx) => slot.kind === 'road' && (
          <div key={`r${idx}`} className={styles.axisCell} style={{ gridColumn: idx + 2, gridRow: 3 }}>
            <div className={styles.road} title={t('cards.road.name')} />
          </div>
        ))}

        {/* Expansions built below a settlement/city — sits between the core and the bottom regions */}
        {settlementSlots.map(({ slot, idx }, k) => (
          <div key={`eb${k}`} className={styles.expBelowCell} style={{ gridColumn: 2 * k + 2, gridRow: 4 }}>
            <SettlementExpansions slot={slot} idx={idx} side="below" placing={placing} onAction={onAction} onInspect={setInspectCardId} />
          </div>
        ))}

        {/* Bottom regions */}
        {bottomRow.map((cell, j) => cell && (
          <div key={`b${j}`} className={styles.regionCell} style={{ gridColumn: 2 * j + 1, gridRow: 5 }}>
            {regionCard(cell)}
          </div>
        ))}

        {/* Extend the principality with a road off either end (only beside a settlement/city) */}
        {canExtend(principality[0]) && (
          <div className={styles.axisCell} style={{ gridColumn: 1, gridRow: 3 }}>
            <button
              className={`${styles.buildRoad} ${isReady('road') ? '' : styles.unaffordable}`}
              title={t('cards.road.name')}
              onClick={() => setPendingBuild({ kind: 'road', action: { type: 'BUILD_ROAD', side: 'left' } })}
            >
              +
            </button>
          </div>
        )}
        {canExtend(principality[principality.length - 1]) && (
          <div className={styles.axisCell} style={{ gridColumn: totalCols, gridRow: 3 }}>
            <button
              className={`${styles.buildRoad} ${isReady('road') ? '' : styles.unaffordable}`}
              title={t('cards.road.name')}
              onClick={() => setPendingBuild({ kind: 'road', action: { type: 'BUILD_ROAD', side: 'right' } })}
            >
              +
            </button>
          </div>
        )}
      </div>

      {pendingBuild && resources && (
        <BuildConfirmDialog
          kind={pendingBuild.kind}
          resources={resources}
          blocker={buildBlocker(pendingBuild.kind)}
          onConfirm={() => { onAction(pendingBuild.action); setPendingBuild(null) }}
          onClose={() => setPendingBuild(null)}
        />
      )}

      {inspectCardId && (
        <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />
      )}
    </div>
  )
}
