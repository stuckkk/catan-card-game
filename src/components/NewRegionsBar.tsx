import { useTranslation } from 'react-i18next'
import { getRegion } from '../engine/regions'
import type { GameAction, PendingNewRegions, RegionState } from '../engine/types'
import { RESOURCE_ICON } from './resourceMeta'
import styles from './RegionChoiceBar.module.css'

interface Props {
  choice: PendingNewRegions
  regions: RegionState[]
  onAction: (a: GameAction) => void
}

/** Banner over the board after building a Settlement: which of the 2 drawn Regions goes above
 *  (the other goes below). Both already lie at the new Settlement. */
export default function NewRegionsBar({ choice, regions, onAction }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.bar}>
      <span className={styles.prompt}>{t('game.newRegions.prompt')}</span>
      <span className={styles.buttons}>
        {choice.regionIndices.map(i => {
          const def = getRegion(regions[i].regionId)
          return (
            <button key={def.id} className="primary" onClick={() => onAction({ type: 'PLACE_NEW_REGIONS', above: def.id })}>
              {RESOURCE_ICON[def.resourceType]} {t(def.nameKey)} {def.productionNumber}
            </button>
          )
        })}
      </span>
    </div>
  )
}
