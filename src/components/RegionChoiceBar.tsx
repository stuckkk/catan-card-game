import { useTranslation } from 'react-i18next'
import { getRegion } from '../engine/regions'
import type { PendingRegionChoice, RegionState, ResourceType } from '../engine/types'
import { RESOURCE_ICON, RESOURCE_ORDER } from './resourceMeta'
import styles from './RegionChoiceBar.module.css'

interface Props {
  choice: PendingRegionChoice
  regions: RegionState[]
  picks: number[]
  onReset: () => void
  onConfirm: () => void
}

/** Region choice banner over the board: per resource, how many are placed (+) or taken (−) so
 *  far, with Reset and Confirm (once every resource has its Region). */
export default function RegionChoiceBar({ choice, regions, picks, onReset, onConfirm }: Props) {
  const { t } = useTranslation()
  const types = RESOURCE_ORDER.filter(r => choice.changes[r])
  const done = (r: ResourceType) => picks.filter(i => getRegion(regions[i].regionId).resourceType === r).length
  const complete = types.every(r => done(r) === Math.abs(choice.changes[r]!))
  return (
    <div className={styles.bar}>
      <span className={styles.prompt}>{t('game.regionChoice.prompt')}</span>
      <span className={styles.counts}>
        {types.map(r => {
          const n = choice.changes[r]!
          return (
            <span key={r} className={styles.count}>
              {n > 0 ? '+' : '−'}{Math.abs(n)}{RESOURCE_ICON[r]} <small>{done(r)}/{Math.abs(n)}</small>
            </span>
          )
        })}
      </span>
      <span className={styles.buttons}>
        <button className="secondary" disabled={picks.length === 0} onClick={onReset}>{t('game.regionChoice.reset')}</button>
        <button className="primary" disabled={!complete} onClick={onConfirm}>{t('game.confirm')}</button>
      </span>
    </div>
  )
}
