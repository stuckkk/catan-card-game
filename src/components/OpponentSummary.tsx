import { useTranslation } from 'react-i18next'
import type { PlayerId, GameState, ProjectedState } from '../engine/types'
import { computePlayerStats, computeVP } from '../engine/engine'
import styles from './OpponentSummary.module.css'

interface Props {
  expanded: boolean
  onToggle: () => void
  role: PlayerId
  gameState: GameState | null
  projected: ProjectedState | null
}

export default function OpponentSummary({ expanded, onToggle, role, gameState, projected }: Props) {
  const { t } = useTranslation()

  let oppHandSize: number
  let oppVP: number
  let oppStrength: number
  let oppCommerce: number
  let oppProgress: number
  let hasHeroToken: boolean
  let hasTradeToken: boolean

  if (role === 'host' && gameState) {
    const oppState = gameState.players.guest
    const stats = computePlayerStats(oppState)
    oppHandSize = oppState.hand.length
    oppVP = computeVP(gameState, 'guest')
    oppStrength = stats.strengthPoints
    oppCommerce = stats.commercePoints
    oppProgress = stats.progressPoints
    const hostStats = computePlayerStats(gameState.players.host)
    hasHeroToken = oppStrength >= 3 && oppStrength > hostStats.strengthPoints
    hasTradeToken = oppCommerce >= 3 && oppCommerce > hostStats.commercePoints
  } else if (role === 'guest' && projected) {
    const oppState = projected.players.host
    oppHandSize = typeof oppState.hand === 'number' ? oppState.hand : 0
    // Guest doesn't have full host stats — show what we can derive
    const guestStats = computePlayerStats(projected.players.guest)
    oppVP = 0  // host VP not visible to guest
    oppStrength = 0
    oppCommerce = 0
    oppProgress = 0
    hasHeroToken = guestStats.strengthPoints < 3  // rough heuristic
    hasTradeToken = guestStats.commercePoints < 3
  } else {
    return null
  }

  return (
    <div className={styles.summary}>
      <button className={styles.toggle} onClick={onToggle}>
        <span>{t('game.opponentTurn')}</span>
        <span className={styles.quickStats}>
          {oppVP > 0 && <span className={styles.vp}>{t('game.currentVP', { count: oppVP })}</span>}
          <span className={styles.hand}>{t('game.handSize', { count: oppHandSize })}</span>
          {hasHeroToken && <span className={styles.token}>⚔ Hero</span>}
          {hasTradeToken && <span className={styles.token}>⚖ Trade</span>}
        </span>
        <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className={styles.detail}>
          <div className={styles.statRow}>
            <span>⚔ {t('symbols.strength')}</span><span>{oppStrength}</span>
          </div>
          <div className={styles.statRow}>
            <span>⚖ {t('symbols.commerce')}</span><span>{oppCommerce}</span>
          </div>
          <div className={styles.statRow}>
            <span>📚 {t('symbols.progress')}</span><span>{oppProgress}</span>
          </div>
        </div>
      )}
    </div>
  )
}
