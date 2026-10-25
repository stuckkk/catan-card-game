import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId } from '../engine/types'
import { DRAW_STACK_IDS } from '../engine/cards'
import styles from './Panel.module.css'

interface Props {
  selected?: DrawStackId | null
  /** Cards left per stack, shown under each name. */
  counts?: Record<DeckId, number>
  /** Stacks that can't be picked. */
  disabled?: (deck: DrawStackId) => boolean
  onPick: (deck: DrawStackId) => void
}

/** The 5 expansion stacks as a row of buttons. */
export default function StackChips({ selected, counts, disabled, onPick }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.cards}>
      {DRAW_STACK_IDS.map(d => (
        <button key={d} className={`${styles.deckChip} ${selected === d ? styles.selected : ''}`} disabled={disabled?.(d)} onClick={() => onPick(d)}>
          {counts ? (
            <>
              <span>{t(`game.deckName.${d}`)}</span>
              <span className={styles.deckCount}>{counts[d]}</span>
            </>
          ) : t(`game.deckName.${d}`)}
        </button>
      ))}
    </div>
  )
}
