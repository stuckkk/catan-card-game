import { useTranslation } from 'react-i18next'
import { getCard } from '../engine/cards'
import type { Resources, Supply } from '../engine/types'
import { basket, missingResources } from './resourceMeta'
import styles from './BuildStrip.module.css'

const KINDS = [
  { kind: 'road', icon: '🛤️' },
  { kind: 'settlement', icon: '🏠' },
  { kind: 'city', icon: '🏰' },
] as const

interface Props {
  resources: Resources
  supply: Supply
  /** Cards left in the Region stack: a new Settlement takes 2. */
  regionsLeft: number
}

/** What Road, Settlement and City cost and whether each is affordable right now. Building
 *  itself happens on the board (the + slots); this is the overview. */
export default function BuildStrip({ resources, supply, regionsLeft }: Props) {
  const { t } = useTranslation()

  return (
    <section className={styles.strip} aria-label={t('game.build.title')}>
      <div className={styles.tiles}>
        {KINDS.map(({ kind, icon }) => {
          const cost = getCard(kind).cost ?? {}
          const missing = basket(missingResources(cost, resources))
          const status = supply[kind] <= 0 ? t('game.build.noneLeft')
            : kind === 'settlement' && regionsLeft < 2 ? t('game.build.noRegions')
            : missing ? t('game.build.missing', { list: missing })
            : null
          return (
            <div key={kind} className={`${styles.tile} ${status ? '' : styles.ready}`}>
              <span className={styles.name}><span aria-hidden="true">{icon}</span> {t(`cards.${kind}.name`)}</span>
              <span className={styles.cost}>{basket(cost)}</span>
              <span className={styles.status}>{status ?? `✓ ${t('game.build.ready')}`}</span>
            </div>
          )
        })}
      </div>
      <p className={styles.hint}>{t('game.build.hint')}</p>
    </section>
  )
}
