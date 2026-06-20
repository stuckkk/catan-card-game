import { useTranslation } from 'react-i18next'
import type { DiceRoll } from '../engine/types'
import styles from './DiceDisplay.module.css'

const EVENT_ICONS: Record<string, string> = {
  bandit: '🗡️', trade: '⚖️', festival: '🎵', harvest: '☀️', event: '?',
}

interface Props { roll: DiceRoll }

export default function DiceDisplay({ roll }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.wrap}>
      <div className={styles.die} title={t(`dice.${roll.eventSymbol}`)}>
        <span className={styles.icon}>{EVENT_ICONS[roll.eventSymbol]}</span>
        <span className={styles.label}>{t(`dice.${roll.eventSymbol}`)}</span>
      </div>
      <div className={styles.die}>
        <span className={styles.number}>{roll.productionNumber}</span>
        <span className={styles.label}>#</span>
      </div>
    </div>
  )
}
