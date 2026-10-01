import { useTranslation } from 'react-i18next'
import type { ResourceType, Resources } from '../engine/types'
import { RESOURCE_ORDER, RESOURCE_ICON } from './resourceMeta'
import styles from './Panel.module.css'

interface Props {
  label: string
  /** Most resources that may be picked. */
  max: number
  /** Optional cap per type (e.g. what the player actually holds). */
  available?: Resources
  value: ResourceType[]
  onChange: (value: ResourceType[]) => void
}

/** Pick a small multiset of resources (e.g. 2 to pay for a search). Tap a resource to add one;
 *  "×" clears the selection. */
export default function ResourcePicker({ label, max, available, value, onChange }: Props) {
  const { t } = useTranslation()
  const picked = (r: ResourceType) => value.filter(x => x === r).length

  return (
    <div className={styles.section}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        {RESOURCE_ORDER.map(r => (
          <button
            key={r}
            className={`${styles.resChip} ${picked(r) > 0 ? styles.selected : ''}`}
            disabled={value.length >= max || (available != null && picked(r) >= available[r])}
            onClick={() => onChange([...value, r])}
            title={t(`resources.${r}`)}
          >
            <span>{RESOURCE_ICON[r]}</span>
            {picked(r) > 0 && <span>×{picked(r)}</span>}
            {available && <span className={styles.deckCount}>{available[r]}</span>}
          </button>
        ))}
        {value.length > 0 && (
          <button className={styles.cardChip} onClick={() => onChange([])} aria-label={t('game.cancel')}>×</button>
        )}
      </div>
    </div>
  )
}
