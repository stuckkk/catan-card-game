import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Resources, ResourceType, GameAction } from '../engine/types'
import { EMPTY_RESOURCES } from '../engine/types'
import TradePanel from './TradePanel'
import styles from './TradeMenu.module.css'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  wood: '🪵', wool: '🐑', gold: '💰', brick: '🧱', ore: '⛏', grain: '🌾',
}

const ALL_RESOURCES: ResourceType[] = ['wood', 'wool', 'gold', 'brick', 'ore', 'grain']

interface Props {
  resources: Resources
  /** Played cards drive the bank trade rate (2:1 with a matching harbour card). */
  playedCards: string[]
  /** True while an offer this player made is still awaiting a response. */
  offerPending: boolean
  onAction: (a: GameAction) => void
}

function total(r: Resources): number {
  return ALL_RESOURCES.reduce((sum, k) => sum + r[k], 0)
}

/** Keep only the non-zero entries, as a Partial<Resources>. */
function trim(r: Resources): Partial<Resources> {
  const out: Partial<Resources> = {}
  for (const k of ALL_RESOURCES) if (r[k] > 0) out[k] = r[k]
  return out
}

/** Collapsible menu for bank trades and player-to-player trade offers. */
export default function TradeMenu({ resources, playedCards, offerPending, onAction }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'bank' | 'player'>('bank')
  const [give, setGive] = useState<Resources>({ ...EMPTY_RESOURCES })
  const [receive, setReceive] = useState<Resources>({ ...EMPTY_RESOURCES })

  const canPropose =
    !offerPending &&
    total(give) > 0 &&
    total(receive) > 0 &&
    ALL_RESOURCES.every(r => give[r] <= resources[r])

  function adjust(
    setter: typeof setGive,
    r: ResourceType,
    delta: number,
    cap?: number,
  ) {
    setter(prev => {
      const next = Math.max(0, prev[r] + delta)
      return { ...prev, [r]: cap != null ? Math.min(cap, next) : next }
    })
  }

  function propose() {
    if (!canPropose) return
    onAction({ type: 'PROPOSE_TRADE', give: trim(give), receive: trim(receive) })
    setGive({ ...EMPTY_RESOURCES })
    setReceive({ ...EMPTY_RESOURCES })
  }

  function stepperRow(
    label: string,
    values: Resources,
    setter: typeof setGive,
    caps: boolean,
  ) {
    return (
      <div className={styles.tradeBlock}>
        <span className={styles.blockLabel}>{label}</span>
        <div className={styles.steppers}>
          {ALL_RESOURCES.map(r => (
            <div key={r} className={styles.stepper}>
              <span className={styles.icon} title={t(`resources.${r}`)}>{RESOURCE_ICONS[r]}</span>
              <div className={styles.stepBtns}>
                <button
                  className={styles.step}
                  onClick={() => adjust(setter, r, -1)}
                  disabled={values[r] === 0}
                >−</button>
                <span className={styles.amount}>{values[r]}</span>
                <button
                  className={styles.step}
                  onClick={() => adjust(setter, r, +1, caps ? resources[r] : undefined)}
                  disabled={caps && values[r] >= resources[r]}
                >+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.menu}>
      <button className={styles.header} onClick={() => setOpen(o => !o)}>
        <span>{t('game.tradeMenu')}</span>
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === 'bank' ? styles.tabActive : ''}`}
              onClick={() => setTab('bank')}
            >{t('game.tradeBankTab')}</button>
            <button
              className={`${styles.tab} ${tab === 'player' ? styles.tabActive : ''}`}
              onClick={() => setTab('player')}
            >{t('game.tradePlayerTab')}</button>
          </div>

          {tab === 'bank' ? (
            <TradePanel resources={resources} playedCards={playedCards} onAction={onAction} />
          ) : (
            <div className={styles.player}>
              {stepperRow(t('game.tradeYouGive'), give, setGive, true)}
              {stepperRow(t('game.tradeYouGet'), receive, setReceive, false)}
              <button className="primary" disabled={!canPropose} onClick={propose}>
                {t('game.proposeTrade')}
              </button>
              {offerPending && <span className={styles.waiting}>{t('game.tradeWaiting')}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
