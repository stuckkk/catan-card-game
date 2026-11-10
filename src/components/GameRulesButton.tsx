import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameConfig, PlayerId } from '../engine/types'
import { playerLabel } from './activityText'
import Modal from './Modal'
import dialog from './Dialog.module.css'
import help from './HelpButton.module.css'
import styles from './GameRulesButton.module.css'

/** 📜 in the game header: this game's settings as plain values, no explanations (GAME_LOGIC.md §12). */
export default function GameRulesButton({ config, myId, isPractice }: {
  config: GameConfig
  myId: PlayerId
  isPractice: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const rows: [string, string][] = [
    [t('rules.vpTarget'), String(config.vpTarget)],
    [t('rules.actionCards'), config.actionCardsFromStart ? t('rules.actionCardsFromStart') : t('rules.actionCardsAt7')],
    [t('rules.brigand'), config.brigandGraceTurns === 0 ? t('rules.brigandOff') : t('rules.turns', { count: config.brigandGraceTurns })],
    [t('rules.startingPlayer'), config.startingPlayer === 'random' ? t('rules.random') : playerLabel(t, config.startingPlayer, myId, isPractice)],
  ]

  return (
    <>
      <button className={help.button} onClick={() => setOpen(true)} aria-label={t('rules.gameTitle')} title={t('rules.gameTitle')}>
        <span aria-hidden="true">📜</span>
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className={dialog.title}>{t('rules.gameTitle')}</div>
          <dl className={styles.list}>
            {rows.map(([label, value]) => (
              <div key={label} className={styles.row}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className={dialog.actions}>
            <button className="primary" onClick={() => setOpen(false)}>{t('card.close')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
