import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useNavigate } from 'react-router-dom'
import {
  computeVP, availableResources, computePlayerStats, actionCardsUnlocked, searchCost, tokenHolders,
} from '../engine/engine'
import { COUNTER_CARD, getCard, hasAttackTarget } from '../engine/cards'
import { ALL_RESOURCE_TYPES, opponent, roomFor } from '../engine/board'
import type { GameAction, PendingChoice, ProjectedState, PlayerId, PlayerState, Resources } from '../engine/types'
import { sessionStore } from '../network/sessionStore'
import { clearPersisted } from '../network/persistence'
import Principality from '../components/Principality'
import PhaseTracker from '../components/PhaseTracker'
import TradeMenu from '../components/TradeMenu'
import TradeOfferBanner from '../components/TradeOfferBanner'
import DrawPanel from '../components/DrawPanel'
import ExchangePanel from '../components/ExchangePanel'
import SearchPanel from '../components/SearchPanel'
import SetupPanel from '../components/SetupPanel'
import Hand from '../components/Hand'
import ResourceBar from '../components/ResourceBar'
import DiceDisplay from '../components/DiceDisplay'
import OpponentSummary from '../components/OpponentSummary'
import OpponentVillage from '../components/OpponentVillage'
import RegionChoiceBar from '../components/RegionChoiceBar'
import ChoiceModal from '../components/ChoiceModal'
import Toasts from '../components/Toasts'
import ActivityFeed from '../components/ActivityFeed'
import BuildStrip from '../components/BuildStrip'
import HelpButton from '../components/HelpButton'
import TokenChip from '../components/TokenChip'
import { describeEvent, isToastWorthy, playerLabel } from '../components/activityText'
import type { ActivityLine } from '../components/activityText'
import styles from './GamePage.module.css'
import { useGameSession } from './useGameSession'

/** What the player waits for while the opponent answers a prompt. */
const WAITING_KEY: Record<Exclude<PendingChoice['kind'], 'placedCard'>, string> = {
  resource: 'game.chooseResource.waiting',
  counter: 'game.attack.counterWaiting',
  attackRoll: 'game.attack.rollWaiting',
  handCard: 'game.handCard.waiting',
  masterBuilder: 'game.masterBuilder.waiting',
  region: 'game.regionChoice.waiting',
  discard: 'game.discardNow.waiting',
}

function waitingText(t: TFunction, choice: PendingChoice): string {
  const key = choice.kind === 'placedCard' ? `game.${choice.reason}.waiting` : WAITING_KEY[choice.kind]
  return t(key, 'attackCardId' in choice ? { card: t(getCard(choice.attackCardId).nameKey) } : undefined)
}

/** The final score once someone has won. */
function GameOver({ view, myId, isPractice, onLeave }: {
  view: ProjectedState
  myId: PlayerId
  isPractice: boolean
  onLeave: () => void
}) {
  const { t } = useTranslation()
  const tokens = tokenHolders(view)
  return (
    <div className={styles.winOverlay}>
      <div className={styles.winCard}>
        <h2>{view.winner === myId ? t('game.youWin') : t('game.opponentWins')}</h2>
        <ul className={styles.finalScore}>
          {(['host', 'guest'] as PlayerId[]).map(pl => (
            <li key={pl} className={pl === view.winner ? styles.scoreWinner : undefined}>
              <span>{playerLabel(t, pl, myId, isPractice)}</span>
              <span className={styles.scoreTokens}>
                {tokens.knight === pl && <span title={t('advantage.knight')}>⚔️</span>}
                {tokens.windmill === pl && <span title={t('advantage.windmill')}>⚖️</span>}
              </span>
              <span className={styles.scoreVP}>{t('game.currentVP', { count: computeVP(view, pl) })}</span>
            </li>
          ))}
        </ul>
        <button className="primary" onClick={onLeave}>{t('game.backToLobby')}</button>
      </div>
    </div>
  )
}

export default function GamePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { role, isPractice, myId, view, dispatchAction, disconnected, expired } = useGameSession()

  const [opponentExpanded, setOpponentExpanded] = useState(false)
  // Card-first placement: the expansion card the player is currently placing on the board.
  const [placingCardId, setPlacingCardId] = useState<string | null>(null)

  // Board actions clear placement mode once a card has been placed on a slot.
  const handleBoardAction = useCallback((action: GameAction) => {
    dispatchAction(action)
    if (action.type === 'PLACE_EXPANSION') {
      setPlacingCardId(null)
    }
  }, [dispatchAction])

  function leaveGame() {
    sessionStore.get()?.close()
    sessionStore.set(null)
    clearPersisted()
    navigate('/')
  }

  const myState = view?.players[myId]
  const opponentState = view?.players[opponent(myId)]
  const myHandRaw = myState?.hand
  const myHand: string[] = Array.isArray(myHandRaw) ? myHandRaw : []
  const myResources = myState ? availableResources(myState) : undefined
  const opponentResources = opponentState ? availableResources(opponentState) : undefined
  const roomOf = (p: Pick<PlayerState, 'regions'>) => Object.fromEntries(ALL_RESOURCE_TYPES.map(r => [r, roomFor(p, r)])) as Resources
  // Attack cards without a target (only the opponent's board and both players' Regions count, all public).
  const noTarget = myState && opponentState
    ? Object.keys(COUNTER_CARD).filter(id => !hasAttackTarget(id, myState, opponentState))
    : []

  const activePlayer = view?.activePlayer
  const isMyTurn = activePlayer === myId
  const phase = view?.phase
  const lastRoll = view?.lastRoll
  const winner = view?.winner
  const pendingTrade = view?.pendingTrade
  const pendingChoices = view?.pendingChoices
  const deckSizes = view?.deckSizes
  const mySearch = view?.search?.player === myId ? view.search : null

  const activeChoice = pendingChoices?.[0] ?? null
  const myChoice = activeChoice && (activeChoice.player === myId || isPractice) ? activeChoice : null

  // Region choice: the Regions tapped so far, for this choice only.
  const regionChoice = myChoice?.kind === 'region' ? myChoice : null
  const regionKey = regionChoice ? `${view?.eventLog.length}|${JSON.stringify(regionChoice)}` : ''
  const [regionPicks, setRegionPicks] = useState<{ key: string; picks: number[] }>({ key: '', picks: [] })
  const picks = regionPicks.key === regionKey ? regionPicks.picks : []

  // Activity: everything logged so far as text, the latest production (to make the producing
  // regions glow), and toasts for what arrives while this screen is open.
  const eventLog = view?.eventLog
  const activity = useMemo(
    () => (eventLog ?? []).map(e => describeEvent(t, e, myId, isPractice)).filter((l): l is ActivityLine => l !== null),
    [eventLog, t, myId, isPractice],
  )
  const lastProduction = eventLog && [...eventLog].reverse().find(e => e.type === 'production')
  const production = lastProduction ? { id: lastProduction.id, roll: Number(lastProduction.payload?.roll) } : null

  const [toasts, setToasts] = useState<ActivityLine[]>([])
  // Log ids already seen; null until the first state arrives, so a reconnect doesn't replay history.
  const seenLog = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!eventLog) return
    if (!seenLog.current) {
      seenLog.current = new Set(isPractice ? [] : eventLog.map(e => e.id))
    }
    const seen = seenLog.current
    const fresh = eventLog.filter(e => !seen.has(e.id))
    fresh.forEach(e => seen.add(e.id))
    const lines = fresh
      .filter(e => isToastWorthy(e, myId, isPractice))
      .map(e => describeEvent(t, e, myId, isPractice))
      .filter((l): l is ActivityLine => l !== null)
    if (lines.length > 0) setToasts(prev => [...prev, ...lines].slice(-3))
  }, [eventLog, myId, isPractice, t])
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(x => x.id !== id)), [])

  // VP for the local player, including the Knight/Windmill tokens (public board state only).
  const myVP = view ? computeVP(view, myId) : 0
  const myTokens = view ? tokenHolders(view) : { knight: null, windmill: null }

  // Placement is only valid during my own action phase; abandon it otherwise.
  useEffect(() => {
    if (placingCardId && !(isMyTurn && phase === 'action')) setPlacingCardId(null)
  }, [placingCardId, isMyTurn, phase])

  // Phone: the turn panel's body is a bottom sheet over the board. It opens by itself when the
  // panel needs the player, stays collapsed otherwise (the board is where building happens),
  // and collapses while a card is being placed. A manual toggle holds until the situation changes.
  const panelNeedsMe = (!!mySearch && mySearch.purpose !== 'masterBuilder') || phase === 'setup' || (isMyTurn && (phase === 'draw' || phase === 'exchange'))
    || (!!pendingTrade && pendingTrade.from !== myId)
  const sheetKey = `${view?.turn}|${phase}|${mySearch?.deck ?? ''}|${pendingTrade ? 'trade' : ''}`
  const [sheetOverride, setSheetOverride] = useState<{ key: string; collapsed: boolean } | null>(null)
  const sheetCollapsed = !!placingCardId || !!regionChoice
    || (sheetOverride?.key === sheetKey ? sheetOverride.collapsed : !panelNeedsMe)

  // One line telling the player what to do now; phases with their own panel explain themselves.
  const turnHint = !phase || phase === 'setup' || winner ? null
    : !isMyTurn ? t('game.hint.waiting')
    : phase === 'roll' ? t('game.hint.roll')
    : phase === 'action' ? t('game.hint.action')
    : null

  if (expired) {
    return (
      <div className={styles.page}>
        <div className={styles.winOverlay}>
          <div className={styles.winCard}>
            <h2>{t('lobby.sessionExpired')}</h2>
            <button className="primary" onClick={leaveGame}>{t('game.backToLobby')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (!role || !view) {
    return (
      <div className={styles.page}>
        <p>{t('lobby.connecting')}</p>
        <button className="secondary" onClick={leaveGame}>{t('game.backToLobby')}</button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {disconnected && (
        <div className={styles.disconnectBanner}>{t('game.disconnected')}</div>
      )}

      {winner && <GameOver view={view} myId={myId} isPractice={isPractice} onLeave={leaveGame} />}

      {/* Mandatory picks; kept out of the turn panel so a collapsed phone sheet can't hide them. */}
      {myChoice && <ChoiceModal choice={myChoice} view={view} myId={myId} hand={myHand} onAction={dispatchAction} />}

      {/* Header: the opponent on the left, the last roll in the middle, my score on the right. */}
      <header className={styles.topBar}>
        <div className={styles.opponent}>
          {opponentState && (
            <OpponentVillage
              principality={opponentState.principality}
              regions={opponentState.regions}
            />
          )}
          <OpponentSummary
            expanded={opponentExpanded}
            onToggle={() => setOpponentExpanded(v => !v)}
            myId={myId}
            view={view}
          />
        </div>

        <div className={styles.roll}>
          {/* Keyed by turn so the dice land again on every new roll. */}
          {lastRoll && <DiceDisplay key={view.turn} roll={lastRoll} />}
        </div>

        <div className={styles.headerEnd}>
          {/* Shows the current language; a tap switches to the other one. */}
          <button
            className={styles.langButton}
            onClick={() => i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')}
            aria-label={t('lobby.language')}
            title={t('lobby.language')}
          >
            {i18n.language.startsWith('de') ? 'DE' : 'EN'}
          </button>
          <HelpButton vpTarget={view.config.vpTarget} />
          <div className={styles.myScore}>
            <span className={styles.myScoreLabel}>{t('game.you')}</span>
            <span className={styles.vp}>{t('game.vpOfTarget', { count: myVP, target: view.config.vpTarget })}</span>
            {(myTokens.knight === myId || myTokens.windmill === myId) && (
              <span className={styles.myTokens}>
                {myTokens.knight === myId && <TokenChip token="knight" />}
                {myTokens.windmill === myId && <TokenChip token="windmill" />}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className={styles.toastArea}>
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>

      {/* My board: the sea the principality sits on. Sized to fit this area (container query). */}
      <main className={styles.myBoard}>
        {regionChoice && myState && (
          <RegionChoiceBar
            choice={regionChoice}
            regions={myState.regions}
            picks={picks}
            onReset={() => setRegionPicks({ key: regionKey, picks: [] })}
            onConfirm={() => { dispatchAction({ type: 'CHOOSE_REGIONS', regionIndices: picks }); setRegionPicks({ key: '', picks: [] }) }}
          />
        )}
        {placingCardId && (
          <div className={styles.placingBanner}>
            <span>{t('game.placing', { card: t(getCard(placingCardId).nameKey) })}</span>
            <button className="secondary" onClick={() => setPlacingCardId(null)}>
              {t('game.cancelPlacement')}
            </button>
          </div>
        )}
        <div className={styles.boardInner}>
          {myState && (
            <Principality
              principality={myState.principality}
              regions={myState.regions}
              isMyBoard
              phase={phase}
              isMyTurn={isMyTurn && !activeChoice}
              placingCardId={placingCardId}
              onAction={handleBoardAction}
              canArrange={phase === 'setup' && !view.setup.picked[myId]}
              hasScout={myHand.includes('scout')}
              regionStack={view.regionStack}
              resources={myResources}
              supply={view.supply}
              production={production}
              regionPick={regionChoice
                ? { choice: regionChoice, picks, onPick: i => setRegionPicks({ key: regionKey, picks: [...picks, i] }) }
                : undefined}
            />
          )}
        </div>
      </main>

      {/* The turn panel: whose turn, which phase, what to do now, and the phase's controls. */}
      <aside className={styles.turn}>
        <div className={styles.turnHead}>
          <div className={styles.statusBar}>
            <span className={isMyTurn ? styles.myTurn : styles.theirTurn}>
              {isMyTurn ? t('game.yourTurn') : t('game.opponentTurn')}
            </span>
          </div>
          <PhaseTracker phase={phase} isMyTurn={isMyTurn} />
          {turnHint && <p className={styles.hint}>{turnHint}</p>}
        </div>

        <div className={`${styles.turnBody} ${sheetCollapsed ? styles.collapsed : ''}`}>
        <button
          className={styles.sheetHandle}
          aria-expanded={!sheetCollapsed}
          onClick={() => setSheetOverride({ key: sheetKey, collapsed: !sheetCollapsed })}
        >
          <span className={styles.grip} aria-hidden="true" />
          <span>{sheetCollapsed ? t('game.sheet.show') : t('game.sheet.hide')}</span>
        </button>
        {pendingTrade && (
          <TradeOfferBanner offer={pendingTrade} myId={myId} onAction={dispatchAction} />
        )}

        {activeChoice && !myChoice && (
          <div className={styles.choiceWaiting}>{waitingText(t, activeChoice)}</div>
        )}

        {phase === 'action' && isMyTurn && !activeChoice && myResources && (
          <BuildStrip resources={myResources} supply={view.supply} regionsLeft={view.regionStack.length} />
        )}

        {phase === 'action' && isMyTurn && !activeChoice && myResources && myState && (
          <TradeMenu
            resources={myResources}
            playedCards={myState.playedCards}
            offerPending={!!pendingTrade}
            onAction={dispatchAction}
          />
        )}

        {phase === 'setup' && <SetupPanel view={view} myId={myId} onAction={dispatchAction} />}

        {mySearch && mySearch.purpose !== 'masterBuilder' && !activeChoice && view.searchContents && (
          <SearchPanel key={`${mySearch.deck}-${mySearch.purpose}`} search={mySearch} contents={view.searchContents} onAction={dispatchAction} />
        )}

        {phase === 'draw' && isMyTurn && !mySearch && myState && myResources && deckSizes && (
          <DrawPanel
            hand={myHand}
            handLimit={computePlayerStats(myState).handLimit}
            deckSizes={deckSizes}
            resources={myResources}
            searchCost={searchCost(myState)}
            onAction={dispatchAction}
          />
        )}

        {phase === 'exchange' && isMyTurn && !mySearch && myState && myResources && deckSizes && (
          <ExchangePanel
            hand={myHand}
            deckSizes={deckSizes}
            resources={myResources}
            searchCost={searchCost(myState)}
            onAction={dispatchAction}
          />
        )}

        <ActivityFeed lines={activity} />
        </div>

        <div className={styles.controls}>
          {phase === 'roll' && isMyTurn && (
            <button className="primary" onClick={() => dispatchAction({ type: 'ROLL_DICE' })}>
              {t('game.rollDice')}
            </button>
          )}
          {phase === 'action' && isMyTurn && !activeChoice && (
            <button className="primary" onClick={() => dispatchAction({ type: 'END_ACTION_PHASE' })}>
              {t('game.endTurn')}
            </button>
          )}
          {phase === 'exchange' && isMyTurn && !mySearch && (
            <button className="secondary" onClick={() => dispatchAction({ type: 'SKIP_EXCHANGE' })}>
              {t('game.skipExchange')}
            </button>
          )}
        </div>
      </aside>

      {/* The tray: what I hold. */}
      <footer className={styles.tray}>
        {myResources && <ResourceBar resources={myResources} />}
        <Hand
          cardIds={myHand}
          isMyTurn={isMyTurn && !activeChoice}
          phase={phase}
          resources={myResources}
          opponentResources={opponentResources}
          myRoom={myState ? roomOf(myState) : undefined}
          opponentRoom={opponentState ? roomOf(opponentState) : undefined}
          noTarget={noTarget}
          actionsUnlocked={actionCardsUnlocked(view)}
          onAction={dispatchAction}
          onBeginPlacement={setPlacingCardId}
        />
      </footer>
    </div>
  )
}
