import { useTranslation } from 'react-i18next'
import type { Resources, ResourceType } from '../engine/types'
import styles from './ResourceBar.module.css'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  wood: '🪵', wool: '🐑', gold: '💰', brick: '🧱', ore: '⛏', grain: '🌾',
}

const RESOURCE_COLORS: Record<ResourceType, string> = {
  wood: 'var(--color-wood)',
  wool: 'var(--color-wool)',
  gold: 'var(--color-gold)',
  brick: 'var(--color-brick)',
  ore: 'var(--color-ore)',
  grain: 'var(--color-grain)',
}

interface Props {
  resources: Resources
}

const ALL_RESOURCES: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']

export default function ResourceBar({ resources }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.bar}>
      {ALL_RESOURCES.map(r => (
        <div key={r} className={styles.resource} style={{ '--rc': RESOURCE_COLORS[r] } as React.CSSProperties}>
          <span className={styles.icon}>{RESOURCE_ICONS[r]}</span>
          <span className={styles.count}>{resources[r]}</span>
          <span className={styles.name}>{t(`resources.${r}`)}</span>
        </div>
      ))}
    </div>
  )
}
