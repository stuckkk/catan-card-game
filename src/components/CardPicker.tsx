import { useTranslation } from 'react-i18next'
import CardView from './CardView'
import styles from './CardPicker.module.css'

interface Props {
  /** Card ids in display order, each with the index the caller refers to it by. */
  items: { cardId: string; index: number }[]
  selected: number[]
  onToggle: (index: number) => void
  /** Indices shown dimmed that cannot be picked. */
  disabled?: number[]
  /** Index of the card to badge as the top of its stack, if any. */
  topIndex?: number
  /** Open the full card text; omitted when the cards can be read elsewhere (the hand). */
  onInspect?: (index: number) => void
}

/** A grid of real cards to pick from (search, put back, exchange). */
export default function CardPicker({ items, selected, onToggle, disabled = [], topIndex, onInspect }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.grid}>
      {items.map(({ cardId, index }) => (
        <div key={index} className={styles.pick} data-testid="search-card">
          {index === topIndex && <span className={styles.top}>{t('game.search.topLabel')}</span>}
          <CardView
            cardId={cardId}
            selected={selected.includes(index)}
            affordable={!disabled.includes(index)}
            onClick={() => !disabled.includes(index) && onToggle(index)}
          />
          {onInspect && (
            <button className={styles.details} onClick={() => onInspect(index)} title={t('game.search.details')}>
              {t('game.search.detailsShort')}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
