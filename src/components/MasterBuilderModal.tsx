import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckId, DrawStackId, GameAction, PendingMasterBuilderChoice } from '../engine/types'
import { getCard } from '../engine/cards'
import CardPicker from './CardPicker'
import CardDetail from './CardDetail'
import Modal from './Modal'
import StackChips from './StackChips'
import dialog from './Dialog.module.css'
import panel from './Panel.module.css'

interface Props {
  choice: PendingMasterBuilderChoice
  deckSizes: Record<DeckId, number>
  /** The open stack's contents (top = last) once the player looks through it, else null. */
  contents: string[] | null
  hand: string[]
  onAction: (a: GameAction) => void
}

/** Master Builder: look through a stack (not the roller's), then take nothing or swap 1 card:
 *  take 1 and put 1 hand card (may be the one just taken) under any stack. */
export default function MasterBuilderModal({ choice, deckSizes, contents, hand, onAction }: Props) {
  const { t } = useTranslation()
  const [deck, setDeck] = useState<DrawStackId | null>(null)
  const [taken, setTaken] = useState<number | null>(null)
  const [giveBack, setGiveBack] = useState<number | null>(null)
  const [toDeck, setToDeck] = useState<DrawStackId>('stack-1')
  // Second step: the card to take is chosen, now pick what goes back.
  const [giving, setGiving] = useState(false)
  // Card opened in the detail sheet (index into `contents`).
  const [inspecting, setInspecting] = useState<number | null>(null)

  if (!contents) {
    return (
      <Modal>
        <div className={dialog.title}>{t('game.masterBuilder.title')}</div>
        <p className={dialog.hint}>
          {choice.excludeDeck
            ? t('game.masterBuilder.pickStackOther', { stack: t(`game.deckName.${choice.excludeDeck}`) })
            : t('game.masterBuilder.pickStack')}
        </p>
        <StackChips selected={deck} counts={deckSizes} disabled={d => d === choice.excludeDeck || deckSizes[d] === 0} onPick={setDeck} />
        <div className={dialog.actions}>
          <button className="primary" disabled={!deck} onClick={() => deck && onAction({ type: 'SEARCH_STACK', deck })}>
            {t('game.masterBuilder.look')}
          </button>
        </div>
      </Modal>
    )
  }

  // Shown top card first, like the other searches.
  const items = contents.map((cardId, index) => ({ cardId, index })).reverse()
  const giveOptions = taken === null ? [] : [...hand, contents[taken]]
  // Two steps, so picking a card doesn't grow the sheet and push the buttons off-screen.
  return (
    <Modal>
      <div className={dialog.title}>{t('game.masterBuilder.title')}</div>
      {!giving || taken === null ? (
        <>
          <p className={dialog.hint}>{t('game.masterBuilder.takeHint')}</p>
          <CardPicker
            items={items}
            selected={taken === null ? [] : [taken]}
            onToggle={i => { setTaken(taken === i ? null : i); setGiveBack(null) }}
            topIndex={contents.length - 1}
            onInspect={setInspecting}
          />
          <div className={dialog.actions}>
            <button className="secondary" onClick={() => onAction({ type: 'TAKE_FROM_SEARCH', cardIds: [] })}>
              {t('game.masterBuilder.takeNothing')}
            </button>
            <button className="primary" disabled={taken === null} onClick={() => setGiving(true)}>
              {t('game.masterBuilder.next')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={dialog.hint}>{t('game.masterBuilder.giveHint', { card: t(getCard(contents[taken]).nameKey) })}</p>
          <div className={panel.section}>
            <span className={panel.label}>{t('game.masterBuilder.giveBack')}</span>
          </div>
          <CardPicker
            items={giveOptions.map((cardId, index) => ({ cardId, index }))}
            selected={giveBack === null ? [] : [giveBack]}
            onToggle={i => setGiveBack(giveBack === i ? null : i)}
          />
          <div className={panel.section}>
            <span className={panel.label}>{t('game.masterBuilder.giveBackTo')}</span>
            <StackChips selected={toDeck} counts={deckSizes} onPick={setToDeck} />
          </div>
          <div className={dialog.actions}>
            <button className="secondary" onClick={() => setGiving(false)}>
              {t('game.masterBuilder.back')}
            </button>
            <button
              className="primary"
              disabled={giveBack === null}
              onClick={() => giveBack !== null && onAction({
                type: 'TAKE_FROM_SEARCH', cardIds: [contents[taken]], giveBack: { cardId: giveOptions[giveBack], toDeck },
              })}
            >
              {t('game.masterBuilder.swap')}
            </button>
          </div>
        </>
      )}
      {inspecting != null && <CardDetail cardId={contents[inspecting]} onClose={() => setInspecting(null)} />}
    </Modal>
  )
}
