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
  { key: 'hand-check', mapsFrom: ['hand-check'] },
  { key: 'swap', mapsFrom: ['swap'] },
]

interface Props {
  phase: TurnPhase | undefined
  isMyTurn: boolean
}

export default function PhaseTracker({ phase, isMyTurn }: Props) {
  const { t } = useTranslation()
  const activeIndex = phase ? STEPS.findIndex(s => s.mapsFrom.includes(phase)) : -1

  return (
    <div className={styles.tracker} aria-label={t('game.phaseTracker')}>
      {STEPS.map((step, i) => {
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
