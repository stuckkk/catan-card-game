import { useTranslation } from 'react-i18next'
import { getCard } from '../engine/cards'
import type { DeclarativeEffect, ResourceType, Resources } from '../engine/types'
import { RESOURCE_ORDER, basket, missingResources } from './resourceMeta'
import styles from './CardDetail.module.css'

interface Props {
  cardId: string
  /** Whether the local player can currently act on this card. */
  canPlay?: boolean
  /** Whether the local player can begin placing this expansion card on the board. */
  canBuild?: boolean
  affordable?: boolean
  /** Why the card can't be played right now, if relevant. */
  note?: string | null
  /** The viewer's resources, to say what's missing when a build isn't affordable. */
  resources?: Resources
  onPlay?: () => void
  onBuild?: () => void
  onClose: () => void
}

function useEffectText() {
  const { t } = useTranslation()
  const res = (r: ResourceType) => t(`resources.${r}`)
  return (e: DeclarativeEffect): string => {
    switch (e.type) {
      case 'GRANT_SYMBOL': return t('effects.symbol', { amount: e.amount, symbol: t(`symbols.${e.symbol}`) })
      case 'IMPROVED_TRADE': return t('effects.trade', { rate: e.rate, resource: res(e.resource) })
      case 'INCREASE_HAND_LIMIT': return t('effects.handLimit', { amount: e.amount })
      case 'DOUBLE_PRODUCTION': return t('effects.doubleProduction', { resource: res(e.resource) })
      case 'BRIGAND_PROTECTION': return t('effects.brigandProtection')
      case 'STRENGTH_PER_KNIGHT': return t('effects.strengthPerKnight', { amount: e.amount })
      case 'COMMERCE_PER_FLEET': return t('effects.commercePerFleet', { amount: e.amount })
      case 'SEARCH_DISCOUNT': return t('effects.searchDiscount')
      case 'PLAGUE_PROTECTION': return t(e.scope === 'city' ? 'effects.plagueCity' : 'effects.plaguePrincipality')
    }
  }
}

export default function CardDetail({ cardId, canPlay, canBuild, affordable = true, note, resources, onPlay, onBuild, onClose }: Props) {
  const { t } = useTranslation()
  const effectText = useEffectText()
  const def = getCard(cardId)

  const cost = def.cost ? RESOURCE_ORDER.filter(r => (def.cost?.[r] ?? 0) > 0) : []
  const typeLabel = [
    t(`cardType.${def.expansionColor ?? def.category}`),
    def.expansionKind ? t(`cardType.${def.expansionKind}`) : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={[styles.swatch, styles[def.expansionColor ?? (def.category === 'action' ? 'yellow' : 'central')]].join(' ')} />
        <h3 className={styles.name}>{t(def.nameKey)}</h3>
        <p className={styles.type}>{typeLabel}</p>

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
            <span className={styles.rowValue}>{effectText(e)}</span>
          </div>
        ))}

        {def.notImplemented && <p className={styles.description}>{t('card.notInDeck')}</p>}
        {note && <p className={styles.description}>{note}</p>}
        {canBuild && !affordable && resources && def.cost && (
          <p className={styles.missing}>{t('card.missing', { list: basket(missingResources(def.cost, resources)) })}</p>
        )}

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
