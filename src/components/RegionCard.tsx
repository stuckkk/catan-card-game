import { useTranslation } from 'react-i18next'
import { getRegion } from '../engine/cards'
import type { RegionState } from '../engine/types'
import styles from './RegionCard.module.css'

const RESOURCE_COLOR: Record<string, string> = {
  wood: 'var(--color-wood)',
  wool: 'var(--color-wool)',
  gold: 'var(--color-gold)',
  brick: 'var(--color-brick)',
  ore: 'var(--color-ore)',
  grain: 'var(--color-grain)',
}

const RESOURCE_ICON: Record<string, string> = {
  wood: '🪵', wool: '🐑', gold: '💰', brick: '🧱', ore: '⛏', grain: '🌾',
}

interface Props {
  region: RegionState
}

export default function RegionCard({ region }: Props) {
  const { t } = useTranslation()
  const def = getRegion(region.regionId)
  const fill = region.storedResources

  return (
    <div
      className={styles.region}
      style={{ '--rc': RESOURCE_COLOR[def.resourceType] } as React.CSSProperties}
      title={t(def.nameKey)}
    >
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
