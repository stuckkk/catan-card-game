import { useTranslation } from 'react-i18next'
import type { ResourceType, Resources } from '../engine/types'
import ResourcePicker from './ResourcePicker'
import styles from './Panel.module.css'

interface Props {
  /** Resources a Search costs (2, or 1 with a Town Hall). */
  cost: number
  available: Resources
  value: ResourceType[]
  onChange: (value: ResourceType[]) => void
  onConfirm: () => void
}

/** Paying for a Search: pick the resources, then confirm. */
export default function PaidSearch({ cost, available, value, onChange, onConfirm }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.paid}>
      <ResourcePicker label={t('game.pay.label', { count: cost })} max={cost} available={available} value={value} onChange={onChange} />
      <button className="primary" disabled={value.length !== cost} onClick={onConfirm}>
        {t('game.pay.confirm')}
      </button>
    </div>
  )
}
