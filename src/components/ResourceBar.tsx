import { useTranslation } from 'react-i18next'
import type { Resources } from '../engine/types'
import { ALL_RESOURCE_TYPES } from '../engine/board'
import { RESOURCE_COLOR, RESOURCE_ICON } from './resourceMeta'
import styles from './ResourceBar.module.css'

interface Props {
  resources: Resources
}

export default function ResourceBar({ resources }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.bar} data-testid="resource-bar">
      {ALL_RESOURCE_TYPES.map(r => (
        <div key={r} className={styles.resource} data-resource={r} style={{ '--rc': RESOURCE_COLOR[r] } as React.CSSProperties}>
          <span className={styles.icon}>{RESOURCE_ICON[r]}</span>
          <span className={styles.count} data-testid={`res-${r}`}>{resources[r]}</span>
          <span className={styles.name}>{t(`resources.${r}`)}</span>
        </div>
      ))}
    </div>
  )
}
