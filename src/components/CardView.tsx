import { useTranslation } from 'react-i18next'
import { getCard } from '../engine/cards'
import { ALL_RESOURCE_TYPES } from '../engine/board'
import type { Resources, SymbolType } from '../engine/types'
import { RESOURCE_ICON } from './resourceMeta'
import styles from './CardView.module.css'

const COLOR_CLASS: Record<string, string> = {
  green: styles.green,
  red: styles.red,
  yellow: styles.yellow,
}

const SYMBOL_ICON: Record<SymbolType, string> = {
  strength: '⚔️', tournament: '🛡️', commerce: '⚖️',
}

interface Props {
  cardId: string
  compact?: boolean
  selected?: boolean
  affordable?: boolean
  onClick?: () => void
}

function CostBadge({ cost }: { cost: Partial<Resources> }) {
  return (
    <div className={styles.cost}>
      {ALL_RESOURCE_TYPES.filter(r => (cost[r] ?? 0) > 0).map(r => (
        <span key={r} className={styles.costItem}>{cost[r]}{RESOURCE_ICON[r]}</span>
      ))}
    </div>
  )
}

export default function CardView({ cardId, compact, selected, affordable = true, onClick }: Props) {
  const { t } = useTranslation()
  const def = getCard(cardId)
  const colorClass = def.expansionColor ? COLOR_CLASS[def.expansionColor] : (def.category === 'action' ? styles.yellow : styles.central)

  const symbolSummary = def.effects
    .filter(e => e.type === 'GRANT_SYMBOL')
    .map(e => e.type === 'GRANT_SYMBOL' ? `${e.amount}${SYMBOL_ICON[e.symbol]}` : '')
    .join(' ')

  return (
    <button
      className={[styles.card, colorClass, compact && styles.compact, selected && styles.selected, !affordable && styles.unaffordable].filter(Boolean).join(' ')}
      onClick={onClick}
      title={t(def.descriptionKey)}
    >
      <div className={styles.name}>{t(def.nameKey)}</div>

      {!compact && (
        <>
          {def.cost && Object.values(def.cost).some(v => v && v > 0) && (
            <CostBadge cost={def.cost} />
          )}
          <div className={styles.effects}>
            {def.directVP != null && def.directVP > 0 && (
              <span className={styles.vp}>{t('game.currentVP', { count: def.directVP })}</span>
            )}
            {symbolSummary && <span className={styles.symbols}>{symbolSummary}</span>}
            {def.effects.filter(e => e.type === 'IMPROVED_TRADE').map((e, i) => (
              e.type === 'IMPROVED_TRADE' && <span key={i} className={styles.trade}>{e.rate}:1 {RESOURCE_ICON[e.resource]}</span>
            ))}
          </div>
        </>
      )}
    </button>
  )
}
