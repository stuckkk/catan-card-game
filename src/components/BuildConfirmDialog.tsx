import { useTranslation } from 'react-i18next'
import type { Resources } from '../engine/types'
import { getCard } from '../engine/cards'
import { ALL_RESOURCE_TYPES } from '../engine/board'
import { missingResources } from './resourceMeta'
import Modal from './Modal'
import dialog from './Dialog.module.css'
import styles from './BuildConfirmDialog.module.css'

interface Props {
  kind: 'road' | 'settlement' | 'city'
  resources: Resources
  /** Why the build is impossible regardless of resources (e.g. empty supply), or null. */
  blocker: string | null
  onConfirm: () => void
  onClose: () => void
}

/** Confirms a Road/Settlement/City build, showing its cost and any missing resources. */
export default function BuildConfirmDialog({ kind, resources, blocker, onConfirm, onClose }: Props) {
  const { t } = useTranslation()
  const cost = getCard(kind).cost ?? {}
  const parts = ALL_RESOURCE_TYPES.filter(r => (cost[r] ?? 0) > 0)
  const short = missingResources(cost, resources)
  const missing = parts.filter(r => (short[r] ?? 0) > 0)
  const list = (rs: typeof parts, n: (r: typeof parts[number]) => number) =>
    rs.map(r => `${n(r)} ${t(`resources.${r}`)}`).join(', ')

  return (
    <Modal onClose={onClose}>
      <div className={dialog.title}>{t('game.buildConfirm.title', { name: t(`cards.${kind}.name`) })}</div>
      <div>{t('card.cost')}: {list(parts, r => cost[r] ?? 0)}</div>
      {blocker ? (
        <div className={styles.problem}>{blocker}</div>
      ) : missing.length > 0 ? (
        <div className={styles.problem}>
          {t('game.buildConfirm.missing', { list: list(missing, r => short[r] ?? 0) })}
        </div>
      ) : null}
      <div className={dialog.actions}>
        <button className="secondary" onClick={onClose}>{t('game.cancel')}</button>
        <button className="primary" disabled={!!blocker || missing.length > 0} onClick={onConfirm}>
          {t('card.build')}
        </button>
      </div>
    </Modal>
  )
}
