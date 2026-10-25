import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameAction, StackSearch } from '../engine/types'
import CardDetail from './CardDetail'
import CardPicker from './CardPicker'
import { toggleIndex } from './selection'
import styles from './Panel.module.css'

interface Props {
  search: StackSearch
  /** The searched stack, top = last element. */
  contents: string[]
  onAction: (a: GameAction) => void
}

/** An open stack the player is looking through: pick 3 (setup) or 1 card from it. */
export default function SearchPanel({ search, contents, onAction }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number[]>([])
  // Card opened in the detail sheet (index into `contents`).
  const [inspecting, setInspecting] = useState<number | null>(null)
  const needed = search.purpose === 'setup' ? Math.min(3, contents.length) : 1

  // Show the top card first; indices still refer to `contents`.
  const order = contents.map((_, i) => i).reverse()

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.search.title', { stack: t(`game.deckName.${search.deck}`) })}</div>
      <div className={styles.hint}>
        {search.purpose === 'setup' ? t('game.search.setupHint', { count: needed }) : t('game.search.hint')}
      </div>
      <CardPicker
        items={order.map(i => ({ cardId: contents[i], index: i }))}
        selected={selected}
        onToggle={i => setSelected(s => toggleIndex(s, i, needed))}
        topIndex={order[0]}
        onInspect={setInspecting}
      />
      <button
        className="primary"
        disabled={selected.length !== needed}
        onClick={() => onAction({ type: 'TAKE_FROM_SEARCH', cardIds: selected.map(i => contents[i]) })}
      >
        {t('game.search.take')}
      </button>

      {inspecting != null && (
        <CardDetail cardId={contents[inspecting]} onClose={() => setInspecting(null)} />
      )}
    </div>
  )
}
