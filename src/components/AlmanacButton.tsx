import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CARD_COUNTS } from '../engine/cards'
import type { CardDefinition } from '../engine/types'
import { useEffectText } from './CardDetail'
import { basket } from './resourceMeta'
import Modal from './Modal'
import Segmented from './Segmented'
import dialog from './Dialog.module.css'
import help from './HelpButton.module.css'
import styles from './AlmanacButton.module.css'

type Filter = 'all' | 'green' | 'red' | 'action' | 'event'
const FILTERS: Filter[] = ['all', 'green', 'red', 'action', 'event']

/** Which filter a card falls under: its expansion colour, else its category. */
const groupOf = (def: CardDefinition): Filter => def.expansionColor ?? (def.category === 'action' ? 'action' : 'event')

/** 🃏 in the header: every Expansion and Event Card with its copies, cost and effect (GAME_LOGIC.md §10). */
export default function AlmanacButton() {
  const { t } = useTranslation()
  const effectText = useEffectText()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const cards = CARD_COUNTS.filter(([def]) => filter === 'all' || groupOf(def) === filter)

  return (
    <>
      <button className={help.button} onClick={() => setOpen(true)} aria-label={t('almanac.open')} title={t('almanac.open')}>
        <span aria-hidden="true">🃏</span>
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className={dialog.title}>{t('almanac.title')}</div>
          <Segmented
            name="almanac-filter"
            label={t('almanac.filter')}
            options={FILTERS.map(f => ({ value: f, label: t(`almanac.${f}`) }))}
            value={filter}
            onChange={setFilter}
          />
          <ul className={styles.list}>
            {cards.map(([def, count]) => (
              <li key={def.id} className={`${styles.card} ${styles[groupOf(def)]}`}>
                <div className={styles.head}>
                  <strong>{t(def.nameKey)}</strong>
                  <span className={styles.meta}>
                    {def.cost && <span>{basket(def.cost)}</span>}
                    {def.directVP ? <span>{t('almanac.vp', { count: def.directVP })}</span> : null}
                    <span>{t('almanac.copies', { count })}</span>
                  </span>
                </div>
                <p>{t(def.descriptionKey)}</p>
                {def.effects.length > 0 && <p className={styles.effects}>{def.effects.map(effectText).join(' · ')}</p>}
              </li>
            ))}
          </ul>
          <div className={dialog.actions}>
            <button className="primary" onClick={() => setOpen(false)}>{t('card.close')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
