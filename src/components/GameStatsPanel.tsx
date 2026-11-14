import { useTranslation } from 'react-i18next'
import { getRegion } from '../engine/regions'
import { ALL_RESOURCE_TYPES } from '../engine/board'
import type { EventSymbol, GameStats, PlayerId } from '../engine/types'
import { EVENT_ICONS, RESOURCE_ICON } from './resourceMeta'
import styles from './GameStatsPanel.module.css'

interface Props {
  stats: GameStats
  vpTarget: number
  /** Display name per seat. */
  names: Record<PlayerId, string>
}

const SEATS: PlayerId[] = ['host', 'guest']
const EVENT_SYMBOLS: EventSymbol[] = ['brigand', 'commerce', 'tournament', 'yearOfPlenty', 'event']

/** Victory Points after every turn: one line per player, the target as a dashed line. */
function VpChart({ stats, vpTarget, names }: Props) {
  const { t } = useTranslation()
  const history = stats.vpHistory
  const W = 320, H = 150, left = 22, right = 8, top = 8, bottom = 18
  const maxVp = Math.max(vpTarget, ...history.flatMap(h => [h.host, h.guest]))
  const x = (i: number) => left + (history.length > 1 ? (i / (history.length - 1)) * (W - left - right) : 0)
  const y = (vp: number) => top + (1 - vp / maxVp) * (H - top - bottom)
  const step = (W - left - right) / Math.max(1, history.length - 1)
  return (
    <figure className={styles.figure}>
      <figcaption>{t('game.stats.vpOverTime')}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={t('game.stats.vpOverTime')}>
        {[0, vpTarget].map(vp => (
          <g key={vp}>
            <line x1={left} x2={W - right} y1={y(vp)} y2={y(vp)} className={vp ? styles.target : styles.axis} />
            <text x={left - 4} y={y(vp) + 4} textAnchor="end" className={styles.tick}>{vp}</text>
          </g>
        ))}
        <text x={left} y={H - 4} className={styles.tick}>{t('game.stats.turn', { n: 1 })}</text>
        <text x={W - right} y={H - 4} textAnchor="end" className={styles.tick}>{t('game.stats.turn', { n: history.length })}</text>
        {SEATS.map(p => (
          <g key={p} className={styles[p]}>
            <polyline points={history.map((h, i) => `${x(i)},${y(h[p])}`).join(' ')} className={styles.line} />
            <circle cx={x(history.length - 1)} cy={y(history[history.length - 1][p])} r={4} className={styles.dot} />
          </g>
        ))}
        {/* Hover: one invisible column per turn, naming both scores. */}
        {history.map((h, i) => (
          <rect key={i} x={x(i) - step / 2} y={top} width={step} height={H - top - bottom} className={styles.hit}>
            <title>{`${t('game.stats.turn', { n: i + 1 })}: ${SEATS.map(p => `${names[p]} ${h[p]}`).join(', ')}`}</title>
          </rect>
        ))}
      </svg>
      <ul className={styles.legend}>
        {SEATS.map(p => (
          <li key={p}><span className={`${styles.swatch} ${styles[p]}`} />{names[p]}: {history[history.length - 1][p]}</li>
        ))}
      </ul>
    </figure>
  )
}

/** How often each Production Die number came up. */
function DiceChart({ stats }: Pick<Props, 'stats'>) {
  const { t } = useTranslation()
  const max = Math.max(1, ...stats.productionRolls)
  return (
    <figure className={styles.figure}>
      <figcaption>{t('game.stats.productionDie')}</figcaption>
      <div className={styles.bars}>
        {stats.productionRolls.map((n, i) => (
          <div key={i} className={styles.barCol} title={t('game.stats.rolled', { number: i + 1, count: n })}>
            <span className={styles.barValue}>{n}</span>
            <span className={styles.bar} style={{ height: `${(n / max) * 48}px` }} />
            <span className={styles.barLabel}>{i + 1}</span>
          </div>
        ))}
      </div>
      <ul className={styles.chips}>
        {EVENT_SYMBOLS.map(s => (
          <li key={s} title={t(`dice.${s}`)}><span aria-hidden="true">{EVENT_ICONS[s]}</span><span className={styles.srOnly}>{t(`dice.${s}`)}</span> {stats.eventRolls[s]}</li>
        ))}
      </ul>
    </figure>
  )
}

/** What each player's Regions produced, most productive first. */
function ProductionTable({ stats, names }: Pick<Props, 'stats' | 'names'>) {
  const { t } = useTranslation()
  return (
    <figure className={styles.figure}>
      <figcaption>{t('game.stats.production')}</figcaption>
      {SEATS.map(p => {
        const rows = Object.entries(stats.produced[p])
          .map(([id, count]) => ({ def: getRegion(id), count }))
          .sort((a, b) => b.count - a.count
            || ALL_RESOURCE_TYPES.indexOf(a.def.resourceType) - ALL_RESOURCE_TYPES.indexOf(b.def.resourceType))
        return (
          <div key={p} className={styles.production}>
            <span className={styles.productionName}>{names[p]}</span>
            <ul className={styles.chips}>
              {rows.length === 0 && <li>–</li>}
              {rows.map(({ def, count }) => (
                <li key={def.id} title={`${t(def.nameKey)} ${def.productionNumber}`}>
                  <span aria-hidden="true">{RESOURCE_ICON[def.resourceType]}</span>
                  <span className={styles.srOnly}>{t(def.nameKey)}</span>
                  <span className={styles.regionNumber}>{def.productionNumber}</span> ×{count}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </figure>
  )
}

/** The statistics shown after a game: VP over time, the dice, production per Region. */
export default function GameStatsPanel(props: Props) {
  return (
    <div className={styles.panel}>
      {props.stats.vpHistory.length > 0 && <VpChart {...props} />}
      <DiceChart stats={props.stats} />
      <ProductionTable stats={props.stats} names={props.names} />
    </div>
  )
}
