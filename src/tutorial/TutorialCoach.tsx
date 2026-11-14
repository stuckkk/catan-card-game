import { useTranslation } from 'react-i18next'
import type { ProjectedState } from '../engine/types'
import { tutorialStep } from './tutorial'
import styles from './TutorialCoach.module.css'

/** The tutorial's coach: one short explanation for where the game stands, in the turn panel. */
export default function TutorialCoach({ view, onDismiss }: { view: ProjectedState; onDismiss: () => void }) {
  const { t } = useTranslation()
  const step = tutorialStep(view)
  return (
    <div className={styles.coach} role="status">
      <span className={styles.icon} aria-hidden="true">🎓</span>
      <p>{t(`tutorial.${step}`, { target: view.config.vpTarget })}</p>
      <button className="secondary" onClick={onDismiss}>{t(step === 'free' ? 'tutorial.done' : 'tutorial.skip')}</button>
    </div>
  )
}
