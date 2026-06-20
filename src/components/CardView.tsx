import { useTranslation } from 'react-i18next'
import { getCard } from '../engine/cards'
import type { ResourceType, Resources } from '../engine/types'
import styles from './CardView.module.css'

const COLOR_CLASS: Record<string, string> = {
  green: styles.green,
  red: styles.red,
  brown: styles.brown,
  yellow: styles.yellow,
}

const RESOURCE_SYMBOLS: Record<ResourceType, string> = {
  wood: 'W', wool: 'Wo', gold: 'G', brick: 'B', ore: 'O', grain: 'Gr',
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
      {(Object.keys(cost) as ResourceType[]).filter(r => (cost[r] ?? 0) > 0).map(r => (
        <span key={r} className={styles.costItem}>{cost[r]}{RESOURCE_SYMBOLS[r]}</span>
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
    .map(e => e.type === 'GRANT_SYMBOL' ? `${e.amount}${e.symbol[0].toUpperCase()}` : '')
    .join(' ')

  return (
    <button
      className={[styles.card, colorClass, selected && styles.selected, !affordable && styles.unaffordable].filter(Boolean).join(' ')}
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
              <span className={styles.vp}>{def.directVP}VP</span>
            )}
            {symbolSummary && <span className={styles.symbols}>{symbolSummary}</span>}
            {def.effects.filter(e => e.type === 'IMPROVED_TRADE').map((e, i) => (
              e.type === 'IMPROVED_TRADE' && <span key={i} className={styles.trade}>2:1 {e.resource[0].toUpperCase()}</span>
            ))}
          </div>
        </>
      )}
    </button>
  )
}
