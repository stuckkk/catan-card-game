import { useTranslation } from 'react-i18next'
import { getRegion } from '../engine/cards'
import type { RegionState } from '../engine/types'
import { RESOURCE_ICON } from './resourceMeta'
import styles from './RegionCard.module.css'

const RESOURCE_COLOR: Record<string, string> = {
  lumber: 'var(--color-lumber)',
  wool: 'var(--color-wool)',
  gold: 'var(--color-gold)',
  brick: 'var(--color-brick)',
  ore: 'var(--color-ore)',
  grain: 'var(--color-grain)',
}

interface Props {
  region: RegionState
  /** Setup: tap to pick this region for swapping. */
  onClick?: () => void
  selected?: boolean
  /** Set when this region just produced: the production's log id, so the glow plays once per roll. */
  producedKey?: string
}

export default function RegionCard({ region, onClick, selected, producedKey }: Props) {
  const { t } = useTranslation()
  const def = getRegion(region.regionId)
  const fill = region.storedResources

  return (
    <div
      className={[styles.region, onClick ? styles.swappable : '', selected ? styles.selected : ''].join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ '--rc': RESOURCE_COLOR[def.resourceType] } as React.CSSProperties}
      title={t(def.nameKey)}
    >
      {producedKey && (
        <span key={producedKey} className={styles.produced} aria-hidden="true">
          <span className={styles.gain}>{RESOURCE_ICON[def.resourceType]}</span>
        </span>
      )}
      <div className={styles.number}>{def.productionNumber}</div>
      <div className={styles.icon}>{RESOURCE_ICON[def.resourceType]}</div>
      <div className={styles.pips}>
        {[0, 1, 2].map(i => (
          <div key={i} className={[styles.pip, i < fill ? styles.filled : ''].join(' ')} />
        ))}
      </div>
    </div>
  )
}
