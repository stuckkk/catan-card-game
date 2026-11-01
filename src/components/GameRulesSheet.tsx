import { useTranslation } from 'react-i18next'
import { STANDARD_RULES, VP_TARGET_MAX, VP_TARGET_MIN } from '../engine/engine'
import type { GameRules } from '../engine/types'
import Modal from './Modal'
import Segmented from './Segmented'
import dialog from './Dialog.module.css'
import segmented from './Segmented.module.css'
import styles from './GameRulesSheet.module.css'

interface Props {
  rules: GameRules
  onChange: (rules: GameRules) => void
  /** Hot-seat practice: the first player is always random, so there is nothing to choose. */
  showStartingPlayer: boolean
  onClose: () => void
}

/** The lobby's Rules 📋 sheet: the Game Settings for the game about to be created (GAME_LOGIC.md §12). */
export default function GameRulesSheet({ rules, onChange, showStartingPlayer, onClose }: Props) {
  const { t } = useTranslation()
  const set = (patch: Partial<GameRules>) => onChange({ ...rules, ...patch })

  return (
    <Modal onClose={onClose}>
      <div className={dialog.title}>{t('rules.lobbyTitle')}</div>

      <div className={segmented.setting}>
        <span id="vp-label">{t('rules.vpTarget')}</span>
        <div className={styles.stepper} role="group" aria-labelledby="vp-label">
          <button
            className="secondary"
            onClick={() => set({ vpTarget: rules.vpTarget - 1 })}
            disabled={rules.vpTarget <= VP_TARGET_MIN}
            aria-label={t('rules.decrease')}
          >−</button>
          <output className={styles.stepperValue} aria-live="polite">{rules.vpTarget}</output>
          <button
            className="secondary"
            onClick={() => set({ vpTarget: rules.vpTarget + 1 })}
            disabled={rules.vpTarget >= VP_TARGET_MAX}
            aria-label={t('rules.increase')}
          >+</button>
        </div>
      </div>

      <Segmented
        name="action-cards"
        label={t('rules.actionCards')}
        value={rules.actionCardsFromStart}
        onChange={actionCardsFromStart => set({ actionCardsFromStart })}
        options={[
          { value: false, label: t('rules.actionCardsAt7') },
          { value: true, label: t('rules.actionCardsFromStart') },
        ]}
      />

      <Segmented
        name="brigand"
        label={t('rules.brigand')}
        value={rules.brigandGraceTurns}
        onChange={brigandGraceTurns => set({ brigandGraceTurns })}
        options={([0, 2, 4] as const).map(n => ({
          value: n,
          label: n === 0 ? t('rules.brigandOff') : t('rules.turns', { count: n }),
        }))}
      />

      {showStartingPlayer && (
        <Segmented
          name="starting-player"
          label={t('rules.startingPlayer')}
          value={rules.startingPlayer}
          onChange={startingPlayer => set({ startingPlayer })}
          options={[
            { value: 'random', label: t('rules.random') },
            { value: 'host', label: t('rules.me') },
            { value: 'guest', label: t('rules.opponent') },
          ]}
        />
      )}

      <div className={dialog.actions}>
        <button className="secondary" onClick={() => onChange(STANDARD_RULES)}>{t('rules.reset')}</button>
        <button className="primary" onClick={onClose}>{t('rules.done')}</button>
      </div>
    </Modal>
  )
}
