import { useTranslation } from 'react-i18next'
import type { ResourceType, GameAction, PendingResourceChoice } from '../engine/types'
import styles from './ResourceChoiceModal.module.css'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  lumber: '🪵', wool: '🐑', gold: '💰', brick: '🧱', ore: '⛏️', grain: '🌾',
}

interface Props {
  choice: PendingResourceChoice
  onAction: (a: GameAction) => void
}

/** Mandatory picker shown to the player who owns the active pending resource choice
 *  (Commerce: take 1 from the opponent; Tournament, Year of Plenty, Progress: gain 1 free resource).
 *  No cancel — a resource must be chosen to resume the turn. */
export default function ResourceChoiceModal({ choice, onAction }: Props) {
  const { t } = useTranslation()
  const titleKey = `game.chooseResource.${choice.reason}Title`

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.sheet}>
        <div className={styles.title}>{t(titleKey)}</div>
        <div className={styles.picker}>
          {choice.options.map(r => (
            <button
              key={r}
              className={styles.chip}
              onClick={() => onAction({ type: 'CHOOSE_RESOURCE', resource: r })}
              title={t(`resources.${r}`)}
            >
              <span className={styles.icon}>{RESOURCE_ICONS[r]}</span>
              <span className={styles.name}>{t(`resources.${r}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
