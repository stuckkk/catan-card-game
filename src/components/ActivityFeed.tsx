import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityLine } from './activityText'
import styles from './ActivityFeed.module.css'

interface Props {
  /** Oldest first, as logged. */
  lines: ActivityLine[]
}

const SHOWN = 15

/** Collapsible list of recent moves; collapsed, the header previews the latest one. */
export default function ActivityFeed({ lines }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const recent = lines.slice(-SHOWN).reverse()
  const latest = recent[0]

  return (
    <div className={styles.feed}>
      <button className={styles.header} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={styles.title}>{t('game.log.recent')}</span>
        {!open && latest && (
          <span className={styles.preview}>{latest.who ? `${latest.who} ` : ''}{latest.text}</span>
        )}
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className={styles.list}>
          {recent.length === 0 && <li className={styles.empty}>{t('game.log.empty')}</li>}
          {recent.map(line => (
            <li key={line.id} className={styles.item}>
              {line.who && <span className={line.mine ? styles.whoMine : styles.who}>{line.who}</span>}
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
