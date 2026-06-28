import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId, ResourceType, Resources, GameAction } from '../engine/types'
import { getCard, DRAW_STACK_IDS } from '../engine/cards'
import { canSwapAway } from '../engine/engine'
import styles from './SwapPanel.module.css'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  wood: '🪵', wool: '🐑', gold: '💰', brick: '🧱', ore: '⛏', grain: '🌾',
}

const ALL_RESOURCES: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']

interface Props {
  hand: string[]
  decks: Record<DeckId, string[]>
  resources: Resources
  /** Cards drawn this turn during refill; these may not be swapped away. */
  drawnThisTurn: string[]
  onAction: (a: GameAction) => void
}

/**
 * End-of-turn card swap: discard one hand card and either draw the top of a
 * stack (free) or pay 2 of a resource to search a stack for a specific card.
 */
export default function SwapPanel({ hand, decks, resources, drawnThisTurn, onAction }: Props) {
  const { t } = useTranslation()
  const [discardIndex, setDiscardIndex] = useState<number | null>(null)
  const [deck, setDeck] = useState<DrawStackId | null>(null)
  const [paid, setPaid] = useState(false)
  const [payWith, setPayWith] = useState<ResourceType | null>(null)
  const [searchCardId, setSearchCardId] = useState<string | null>(null)

  const discardCardId = discardIndex != null ? hand[discardIndex] : null
  const deckCount = deck ? decks[deck].length : 0

  const canFree = discardCardId != null && deck != null && deckCount > 0
  const canPaid =
    discardCardId != null &&
    deck != null &&
    searchCardId != null &&
    payWith != null &&
    resources[payWith] >= 2

  function freeSwap() {
    if (!canFree || !discardCardId || !deck) return
    onAction({ type: 'FREE_SWAP', discardCardId, fromDeck: deck })
  }

  function paidSwap() {
    if (!canPaid || !discardCardId || !deck || !searchCardId || !payWith) return
    onAction({
      type: 'PAID_SWAP',
      discardCardId,
      fromDeck: deck,
      searchCardId,
      searchDeck: deck,
      payWith,
    })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('game.swapTitle')}</div>
      <div className={styles.hint}>{t('game.swapHint')}</div>

      <div className={styles.section}>
        <span className={styles.label}>{t('game.swapDiscardLabel')}</span>
        <div className={styles.cards}>
          {hand.map((id, i) => {
            const locked = !canSwapAway(hand, drawnThisTurn, id)
            return (
              <button
                key={i}
                className={`${styles.cardChip} ${discardIndex === i ? styles.selected : ''}`}
                disabled={locked}
                title={locked ? t('game.swapDrawnLocked') : undefined}
                onClick={() => setDiscardIndex(d => (d === i ? null : i))}
              >
                {t(getCard(id).nameKey)}
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.label}>{t('game.swapDrawLabel')}</span>
        <div className={styles.cards}>
          {DRAW_STACK_IDS.map(d => (
            <button
              key={d}
              className={`${styles.deckChip} ${deck === d ? styles.selected : ''}`}
              onClick={() => { setDeck(prev => (prev === d ? null : d)); setSearchCardId(null) }}
            >
              <span>{t(`game.deckName.${d}`)}</span>
              <span className={styles.deckCount}>{decks[d].length}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="primary" disabled={!canFree} onClick={freeSwap}>
        {t('game.swapFreeButton')}
      </button>

      <label className={styles.paidToggle}>
        <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />
        {t('game.swapPaidToggle')}
      </label>

      {paid && (
        <div className={styles.paid}>
          <div className={styles.section}>
            <span className={styles.label}>{t('game.swapPaidPayWith')}</span>
            <div className={styles.cards}>
              {ALL_RESOURCES.map(r => (
                <button
                  key={r}
                  className={`${styles.resChip} ${payWith === r ? styles.selected : ''}`}
                  disabled={resources[r] < 2}
                  onClick={() => setPayWith(p => (p === r ? null : r))}
                  title={t(`resources.${r}`)}
                >
                  <span>{RESOURCE_ICONS[r]}</span>
                  <span className={styles.deckCount}>{resources[r]}</span>
                </button>
              ))}
            </div>
          </div>

          {deck && (
            <div className={styles.section}>
              <span className={styles.label}>{t('game.swapPaidSearchLabel')}</span>
              <div className={styles.cards}>
                {decks[deck].map((id, i) => (
                  <button
                    key={i}
                    className={`${styles.cardChip} ${searchCardId === id ? styles.selected : ''}`}
                    onClick={() => setSearchCardId(c => (c === id ? null : id))}
                  >
                    {t(getCard(id).nameKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="primary" disabled={!canPaid} onClick={paidSwap}>
            {t('game.swapPaidButton')}
          </button>
        </div>
      )}
    </div>
  )
}
