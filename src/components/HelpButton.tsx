import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import dialog from './Dialog.module.css'
import styles from './HelpButton.module.css'

const EVENTS = [
  { key: 'brigand', icon: '🗡️' },
  { key: 'commerce', icon: '⚖️' },
  { key: 'tournament', icon: '🛡️' },
  { key: 'yearOfPlenty', icon: '☀️' },
  { key: 'event', icon: '?' },
] as const

const STEPS = ['roll', 'action', 'draw', 'exchange'] as const

/** 📖 in the header (not "?", which is the event die's Event face): a short rules overview (GAME_LOGIC.md §1, §5–§9). */
export default function HelpButton({ vpTarget }: { vpTarget: number }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className={styles.button} onClick={() => setOpen(true)} aria-label={t('game.help.open')} title={t('game.help.open')}>
        <span aria-hidden="true">📖</span>
      </button>
      {open && (
        <div className={dialog.backdrop} onClick={() => setOpen(false)}>
          <div className={dialog.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={dialog.title}>{t('game.help.title')}</div>

            <section className={styles.section}>
              <h3>{t('game.help.goalTitle')}</h3>
              <p>{t('game.help.goal', { target: vpTarget })}</p>
            </section>

            <section className={styles.section}>
              <h3>{t('game.help.turnTitle')}</h3>
              <ol className={styles.steps}>
                {STEPS.map(step => (
                  <li key={step}><strong>{t(`game.phaseShort.${step}`)}</strong> {t(`game.help.step.${step}`)}</li>
                ))}
              </ol>
            </section>

            <section className={styles.section}>
              <h3>{t('game.help.eventsTitle')}</h3>
              <ul className={styles.events}>
                {EVENTS.map(({ key, icon }) => (
                  <li key={key}>
                    <span className={styles.icon} aria-hidden="true">{icon}</span>
                    <span><strong>{t(`dice.${key}`)}</strong> {t(`game.help.event.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.section}>
              <h3>{t('game.help.cardsTitle')}</h3>
              <p>{t('game.help.handLimit')}</p>
              <p>{t('game.help.actionCards')}</p>
            </section>

            <section className={styles.section}>
              <h3>{t('game.help.tradeTitle')}</h3>
              <p>{t('game.help.trade')}</p>
            </section>

            <section className={styles.section}>
              <h3>{t('game.help.tokensTitle')}</h3>
              <p>{t('game.help.tokens')}</p>
            </section>

            <div className={dialog.actions}>
              <button className="primary" onClick={() => setOpen(false)}>{t('card.close')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
