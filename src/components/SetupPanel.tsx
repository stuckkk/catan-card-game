import { useTranslation } from 'react-i18next'
import type { GameAction, PlayerId, ProjectedState } from '../engine/types'
import { setupChooser } from '../engine/engine'
import StackChips from './StackChips'
import styles from './Panel.module.css'

interface Props {
  view: ProjectedState
  myId: PlayerId
  onAction: (a: GameAction) => void
}

/** Setup phase: who starts, rearranging regions, and choosing the stack to take 3 starting
 *  cards from (the search itself is shown by SearchPanel). */
export default function SetupPanel({ view, myId, onAction }: Props) {
  const { t } = useTranslation()
  const chooser = setupChooser(view)
  const picked = view.setup.picked
  const usedStacks = Object.values(picked)

  return (
    <div className={styles.panel}>
      <div className={styles.title}>
        {view.setup.firstPlayer === myId ? t('game.setup.youStart') : t('game.setup.opponentStarts')}
      </div>
      {!picked[myId] && <div className={styles.hint}>{t('game.setup.arrangeHint')}</div>}

      {chooser === myId && !view.search && (
        <>
          <div className={styles.hint}>{t('game.setup.pickHint')}</div>
          <StackChips
            counts={view.deckSizes}
            disabled={d => usedStacks.includes(d) || view.deckSizes[d] === 0}
            onPick={d => onAction({ type: 'SEARCH_STACK', deck: d })}
          />
        </>
      )}

      {chooser !== myId && <div className={styles.hint}>{t('game.setup.waiting')}</div>}
    </div>
  )
}
