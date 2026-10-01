import { useTranslation } from 'react-i18next'
import type { PlayerId, PlayerState, ProjectedState } from '../engine/types'
import { computePlayerStats, computeVP, tokenHolders } from '../engine/engine'
import styles from './OpponentSummary.module.css'

interface Props {
  expanded: boolean
  onToggle: () => void
  myId: PlayerId
  view: ProjectedState
}

/** The opponent's public numbers. Everything here comes from their board (played cards),
 *  which is public, so it works off the projected view. */
export default function OpponentSummary({ expanded, onToggle, myId, view }: Props) {
  const { t } = useTranslation()
  const oppId: PlayerId = myId === 'host' ? 'guest' : 'host'
  const opp = view.players[oppId]
  const oppHandSize = typeof opp.hand === 'number' ? opp.hand : opp.hand.length
  const stats = computePlayerStats(opp as unknown as PlayerState)
  const tokens = tokenHolders(view)

  return (
    <div className={styles.summary}>
      <button className={styles.toggle} onClick={onToggle}>
        <span>{t('game.opponent')}</span>
        <span className={styles.quickStats}>
          <span className={styles.vp}>{t('game.currentVP', { count: computeVP(view, oppId) })}</span>
          <span className={styles.hand}>{t('game.handSize', { count: oppHandSize })}</span>
          {tokens.knight === oppId && <span className={styles.token} title={t('advantage.knight')}>⚔ <span className={styles.tokenName}>{t('advantage.knight')}</span></span>}
          {tokens.windmill === oppId && <span className={styles.token} title={t('advantage.windmill')}>⚖ <span className={styles.tokenName}>{t('advantage.windmill')}</span></span>}
        </span>
        <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className={styles.detail}>
          <div className={styles.statRow}>
            <span>⚔ {t('symbols.strength')}</span><span>{stats.strengthPoints}</span>
          </div>
          <div className={styles.statRow}>
            <span>🛡 {t('symbols.tournament')}</span><span>{stats.tournamentPoints}</span>
          </div>
          <div className={styles.statRow}>
            <span>⚖ {t('symbols.commerce')}</span><span>{stats.commercePoints}</span>
          </div>
        </div>
      )}
    </div>
  )
}
