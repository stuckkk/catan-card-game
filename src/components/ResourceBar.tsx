import { useTranslation } from 'react-i18next'
import type { Resources, ResourceType } from '../engine/types'
import { RESOURCE_ICON } from './resourceMeta'
import styles from './ResourceBar.module.css'

const RESOURCE_COLORS: Record<ResourceType, string> = {
  lumber: 'var(--color-lumber)',
  wool: 'var(--color-wool)',
  gold: 'var(--color-gold)',
  brick: 'var(--color-brick)',
  ore: 'var(--color-ore)',
  grain: 'var(--color-grain)',
}

interface Props {
  resources: Resources
}

const ALL_RESOURCES: ResourceType[] = ['lumber', 'wool', 'gold', 'brick', 'ore', 'grain']

export default function ResourceBar({ resources }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.bar} data-testid="resource-bar">
      {ALL_RESOURCES.map(r => (
        <div key={r} className={styles.resource} data-resource={r} style={{ '--rc': RESOURCE_COLORS[r] } as React.CSSProperties}>
          <span className={styles.icon}>{RESOURCE_ICON[r]}</span>
          <span className={styles.count} data-testid={`res-${r}`}>{resources[r]}</span>
          <span className={styles.name}>{t(`resources.${r}`)}</span>
        </div>
      ))}
    </div>
  )
}
