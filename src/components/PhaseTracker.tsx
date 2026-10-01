import { useTranslation } from 'react-i18next'
import type { TurnPhase } from '../engine/types'
import styles from './PhaseTracker.module.css'

/**
 * The visible stops in a turn. The engine's transient 'event-resolution' and
 * 'production' phases resolve synchronously inside ROLL_DICE, so they map onto
 * the Roll step rather than getting their own stop.
 */
const STEPS: { key: TurnPhase; mapsFrom: TurnPhase[] }[] = [
  { key: 'roll', mapsFrom: ['roll', 'event-resolution', 'production'] },
  { key: 'action', mapsFrom: ['action'] },
  { key: 'draw', mapsFrom: ['draw'] },
  { key: 'exchange', mapsFrom: ['exchange'] },
]

const SETUP_STEPS: typeof STEPS = [{ key: 'setup', mapsFrom: ['setup'] }]

interface Props {
  phase: TurnPhase | undefined
  isMyTurn: boolean
}

export default function PhaseTracker({ phase, isMyTurn }: Props) {
  const { t } = useTranslation()
  const steps = phase === 'setup' ? SETUP_STEPS : STEPS
  const activeIndex = phase ? steps.findIndex(s => s.mapsFrom.includes(phase)) : -1

  return (
    <div className={styles.tracker} aria-label={t('game.phaseTracker')}>
      {steps.map((step, i) => {
        const state = i === activeIndex ? 'current' : i < activeIndex ? 'done' : 'todo'
        return (
          <div
            key={step.key}
            className={[styles.step, styles[state], state === 'current' && isMyTurn ? styles.mine : ''].join(' ')}
          >
            <span className={styles.dot}>{i + 1}</span>
            <span className={styles.label}>{t(`game.phase.${step.key}`)}</span>
          </div>
        )
      })}
    </div>
  )
}
