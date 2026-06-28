import { useTranslation } from 'react-i18next'
import { getCard } from '../engine/cards'
import type { ResourceType } from '../engine/types'
import styles from './CardDetail.module.css'

const RESOURCE_KEYS: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']

interface Props {
  cardId: string
  /** Whether the local player can currently act on this card. */
  canPlay?: boolean
  /** Whether the local player can begin placing this expansion card on the board. */
  canBuild?: boolean
  affordable?: boolean
  onPlay?: () => void
  onBuild?: () => void
  onClose: () => void
}

const SYMBOL_LABEL: Record<string, string> = {
  strength: 'symbols.strength',
  commerce: 'symbols.commerce',
  progress: 'symbols.progress',
}

export default function CardDetail({ cardId, canPlay, canBuild, affordable = true, onPlay, onBuild, onClose }: Props) {
  const { t } = useTranslation()
  const def = getCard(cardId)

  const cost = def.cost ? RESOURCE_KEYS.filter(r => (def.cost?.[r] ?? 0) > 0) : []

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={[styles.swatch, styles[def.expansionColor ?? (def.category === 'action' ? 'yellow' : 'central')]].join(' ')} />
        <h3 className={styles.name}>{t(def.nameKey)}</h3>
        <p className={styles.type}>{t(`cardType.${def.expansionColor ?? def.category}`)}</p>

        <p className={styles.description}>{t(def.descriptionKey)}</p>

        {cost.length > 0 && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('card.cost')}</span>
            <span className={styles.rowValue}>
              {cost.map(r => `${def.cost?.[r]} ${t(`resources.${r}`)}`).join(', ')}
            </span>
          </div>
        )}

        {def.directVP ? (
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('card.victoryPoints')}</span>
            <span className={styles.rowValue}>{def.directVP}</span>
          </div>
        ) : null}

        {def.effects.map((e, i) => (
          <div className={styles.row} key={i}>
            <span className={styles.rowLabel}>{t('card.effect')}</span>
            <span className={styles.rowValue}>
              {e.type === 'GRANT_SYMBOL' && `+${e.amount} ${t(SYMBOL_LABEL[e.symbol])}`}
              {e.type === 'GRANT_RESOURCE' && `+${e.amount} ${t(`resources.${e.resource}`)}`}
              {e.type === 'IMPROVED_TRADE' && `${t('card.improvedTrade')} (${t(`resources.${e.resource}`)})`}
              {e.type === 'GRANT_VP' && `+${e.amount} ${t('game.currentVP', { count: e.amount })}`}
              {e.type === 'INCREASE_HAND_LIMIT' && `+${e.amount}`}
            </span>
          </div>
        ))}

        <div className={styles.actions}>
          {canPlay && onPlay && (
            <button className="primary" disabled={!affordable} onClick={onPlay}>
              {t('card.play')}
            </button>
          )}
          {canBuild && onBuild && (
            <button className="primary" disabled={!affordable} onClick={onBuild}>
              {t('card.build')}
            </button>
          )}
          <button className="secondary" onClick={onClose}>{t('card.close')}</button>
        </div>
      </div>
    </div>
  )
}
