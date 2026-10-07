import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  applyAction, computeVP, availableResources, computePlayerStats, projectStateFor, setupChooser,
  actionCardsUnlocked, searchCost, tokenHolders,
} from '../engine/engine'
import { COUNTER_CARD, getCard, hasAttackTarget } from '../engine/cards'
import { ALL_RESOURCE_TYPES, roomFor } from '../engine/board'
import type { GameState, GameAction, ProjectedState, PlayerId, PlayerState, Resources } from '../engine/types'
import { reconnectSession } from '../network/wsSession'
import type { NetworkSession } from '../network/wsSession'
import { sessionStore } from '../network/sessionStore'
import { clearPersisted, loadPersisted } from '../network/persistence'
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
import ResourceChoiceModal from '../components/ResourceChoiceModal'
import PlacedCardChoiceModal from '../components/PlacedCardChoiceModal'
import AttackModal from '../components/AttackModal'
import HandCardChoiceModal from '../components/HandCardChoiceModal'
import MasterBuilderModal from '../components/MasterBuilderModal'
import DiscardPanel from '../components/DiscardPanel'
import Toasts from '../components/Toasts'
import ActivityFeed from '../components/ActivityFeed'
import BuildStrip from '../components/BuildStrip'
import HelpButton from '../components/HelpButton'
import { describeEvent, isToastWorthy, playerLabel } from '../components/activityText'
import type { ActivityLine } from '../components/activityText'
import dialog from '../components/Dialog.module.css'
import styles from './GamePage.module.css'

type ClientRole = 'host' | 'guest' | 'practice'

/** Practice is a hot-seat game: the seat shown is whoever has to act next. */
function practiceSeat(state: GameState): PlayerId {
  if (state.search) return state.search.player
  if (state.phase === 'setup') return setupChooser(state) ?? state.setup.firstPlayer
  return state.pendingChoices[0]?.player ?? state.activePlayer
}

export default function GamePage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // Source of truth on first mount is the navigation state from the lobby. Note that
  // browsers persist history.state (and so `location.state`) across a page reload of
  // the same entry — it is NOT a reliable signal that this is a fresh SPA navigation.
  // What *does* reset on reload is the in-memory sessionStore (see the effect below),
  // so `persisted` is always loaded as a fallback for reconnecting after one.
  const nav = (location.state ?? {}) as {
    role?: ClientRole
    initialGameState?: GameState
  }
  const persisted = loadPersisted()
  const role: ClientRole | undefined = nav.role ?? persisted?.role

  // Practice mode runs the engine locally; Host/Guest only ever hold what the
  // server last projected to them.
  const [gameState, setGameState] = useState<GameState | null>(nav.initialGameState ?? null)
  const [projected, setProjected] = useState<ProjectedState | null>(null)
  const [disconnected, setDisconnected] = useState(false)
  const [expired, setExpired] = useState(false)
  const [opponentExpanded, setOpponentExpanded] = useState(false)
  // Card-first placement: the expansion card the player is currently placing on the board.
  const [placingCardId, setPlacingCardId] = useState<string | null>(null)

  const sessionRef = useRef<NetworkSession | null>(sessionStore.get())

  const isPractice = role === 'practice'
  const myId: PlayerId = isPractice && gameState ? practiceSeat(gameState) : role === 'guest' ? 'guest' : 'host'

  const dispatchAction = useCallback((action: GameAction) => {
    if (role === 'practice') {
      setGameState(prev => (prev ? applyAction(prev, practiceSeat(prev), action) : prev))
    } else {
      sessionRef.current?.sendAction(action)
    }
  }, [role])

  // Board actions clear placement mode once a card has been placed on a slot.
  const handleBoardAction = useCallback((action: GameAction) => {
    dispatchAction(action)
    if (action.type === 'PLACE_EXPANSION') {
      setPlacingCardId(null)
    }
  }, [dispatchAction])

  // Wire up (or rebuild, after a reload) the network session and its handlers. Host
  // and Guest are symmetric here — neither runs the engine locally.
  // Intentionally returns no cleanup that closes the session: React StrictMode
  // double-invokes effect cleanups in dev, which would tear down the live
  // connection the instant it opens. The session is closed only in leaveGame().
  useEffect(() => {
    if (role !== 'host' && role !== 'guest') return

    function wireSession(session: NetworkSession) {
      sessionRef.current = session
      session.onStateUpdate(state => {
        setProjected(state)
        setDisconnected(false)
      })
      session.onPeerConnect(() => setDisconnected(false))
      session.onPeerDisconnect(() => setDisconnected(true))
      session.onSessionExpired(() => setExpired(true))
    }

    const existing = sessionStore.get()
    if (existing) {
      wireSession(existing)
      return
    }

    // No live session object (a full page reload reset it) — reconnect using the
    // token persisted at creation/join time.
    if (persisted?.roomId && persisted.token && persisted.role) {
      reconnectSession(persisted.roomId, persisted.token, persisted.role)
        .then(session => {
          sessionStore.set(session)
          wireSession(session)
        })
        .catch(() => setExpired(true))
    }
  // persisted is derived from loadPersisted()/nav and stable for this mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  function leaveGame() {
    sessionStore.get()?.close()
    sessionStore.set(null)
    clearPersisted()
    navigate('/')
  }

  // Practice projects the local state exactly like the server does, so the UI only ever
  // works off a ProjectedState.
  const view: ProjectedState | null = isPractice ? (gameState ? projectStateFor(gameState, myId) : null) : projected

  const myState = view?.players[myId]
  const opponentId: PlayerId = myId === 'host' ? 'guest' : 'host'
  const opponentState = view?.players[opponentId]
  const myHandRaw = myState?.hand
  const myHand: string[] = Array.isArray(myHandRaw) ? myHandRaw : []
  // The viewer's own hand is never redacted (only the opponent's is), so it's safe to
  // treat as a full PlayerState here.
  const myFullState = myState as PlayerState | undefined
  const myResources = myFullState ? availableResources(myFullState) : undefined
  const opponentFullState = opponentState as unknown as PlayerState | undefined
  const opponentResources = opponentFullState ? availableResources(opponentFullState) : undefined
  const roomOf = (p: PlayerState) => Object.fromEntries(ALL_RESOURCE_TYPES.map(r => [r, roomFor(p, r)])) as Resources
  // Attack cards without a target (only the opponent's board and both players' Regions count, all public).
  const noTarget = myFullState && opponentFullState
    ? Object.keys(COUNTER_CARD).filter(id => !hasAttackTarget(id, myFullState, opponentFullState))
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
  const sheetCollapsed = !!placingCardId
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

      {winner && (
        <div className={styles.winOverlay}>
          <div className={styles.winCard}>
            <h2>{winner === myId ? t('game.youWin') : t('game.opponentWins')}</h2>
            <ul className={styles.finalScore}>
              {(['host', 'guest'] as PlayerId[]).map(pl => {
                const tokens = tokenHolders(view)
                return (
                  <li key={pl} className={pl === winner ? styles.scoreWinner : undefined}>
                    <span>{playerLabel(t, pl, myId, isPractice)}</span>
                    <span className={styles.scoreTokens}>
                      {tokens.knight === pl && <span title={t('advantage.knight')}>⚔️</span>}
                      {tokens.windmill === pl && <span title={t('advantage.windmill')}>⚖️</span>}
                    </span>
                    <span className={styles.scoreVP}>{t('game.currentVP', { count: computeVP(view, pl) })}</span>
                  </li>
                )
              })}
            </ul>
            <button className="primary" onClick={leaveGame}>{t('game.backToLobby')}</button>
          </div>
        </div>
      )}

      {/* Mandatory picks; kept out of the turn panel so a collapsed phone sheet can't hide them. */}
      {myChoice?.kind === 'resource' && <ResourceChoiceModal choice={myChoice} onAction={dispatchAction} />}
      {myChoice?.kind === 'placedCard' && (
        <PlacedCardChoiceModal
          key={view.eventLog.length}
          choice={myChoice}
          ownerPrincipality={view.players[myChoice.owner].principality}
          onAction={dispatchAction}
        />
      )}
      {(myChoice?.kind === 'counter' || myChoice?.kind === 'attackRoll') && (
        <AttackModal choice={myChoice} hand={myHand} onAction={dispatchAction} />
      )}
      {myChoice?.kind === 'handCard' && view.revealedHand && (
        <HandCardChoiceModal key={view.eventLog.length} choice={myChoice} hand={view.revealedHand} onAction={dispatchAction} />
      )}
      {myChoice?.kind === 'masterBuilder' && deckSizes && (
        <MasterBuilderModal
          key={view.eventLog.length}
          choice={myChoice}
          deckSizes={deckSizes}
          contents={mySearch?.purpose === 'masterBuilder' ? view.searchContents : null}
          hand={myHand}
          onAction={dispatchAction}
        />
      )}
      {myChoice?.kind === 'discard' && myFullState && (
        <div className={dialog.backdrop} role="dialog" aria-modal="true">
          <div className={dialog.sheet}>
            <DiscardPanel
              key={view.eventLog.length}
              hand={myHand}
              handLimit={computePlayerStats(myFullState).handLimit}
              onAction={dispatchAction}
            />
          </div>
        </div>
      )}

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
          <HelpButton vpTarget={view.config.vpTarget} />
          <div className={styles.myScore}>
            <span className={styles.myScoreLabel}>
              {myTokens.knight === myId && <span title={t('advantage.knight')}>⚔️ </span>}
              {myTokens.windmill === myId && <span title={t('advantage.windmill')}>⚖️ </span>}
              {t('game.you')}
            </span>
            <span className={styles.vp}>{t('game.vpOfTarget', { count: myVP, target: view.config.vpTarget })}</span>
          </div>
        </div>
      </header>

      <div className={styles.toastArea}>
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>

      {/* My board: the sea the principality sits on. Sized to fit this area (container query). */}
      <main className={styles.myBoard}>
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
          <div className={styles.choiceWaiting}>
            {t(activeChoice.kind === 'resource' ? 'game.chooseResource.waiting'
              : activeChoice.kind === 'placedCard' ? `game.${activeChoice.reason}.waiting`
              : activeChoice.kind === 'counter' ? 'game.attack.counterWaiting'
              : activeChoice.kind === 'attackRoll' ? 'game.attack.rollWaiting'
              : activeChoice.kind === 'handCard' ? 'game.handCard.waiting'
              : activeChoice.kind === 'masterBuilder' ? 'game.masterBuilder.waiting'
              : 'game.discardNow.waiting', 'attackCardId' in activeChoice ? { card: t(getCard(activeChoice.attackCardId).nameKey) } : undefined)}
          </div>
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

        {mySearch && mySearch.purpose !== 'masterBuilder' && view.searchContents && (
          <SearchPanel key={`${mySearch.deck}-${mySearch.purpose}`} search={mySearch} contents={view.searchContents} onAction={dispatchAction} />
        )}

        {phase === 'draw' && isMyTurn && !mySearch && myFullState && myResources && deckSizes && (
          <DrawPanel
            hand={myHand}
            handLimit={computePlayerStats(myFullState).handLimit}
            deckSizes={deckSizes}
            resources={myResources}
            searchCost={searchCost(myFullState)}
            onAction={dispatchAction}
          />
        )}

        {phase === 'exchange' && isMyTurn && !mySearch && myFullState && myResources && deckSizes && (
          <ExchangePanel
            hand={myHand}
            deckSizes={deckSizes}
            resources={myResources}
            searchCost={searchCost(myFullState)}
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
          myRoom={myFullState ? roomOf(myFullState) : undefined}
          opponentRoom={opponentFullState ? roomOf(opponentFullState) : undefined}
          noTarget={noTarget}
          actionsUnlocked={actionCardsUnlocked(view)}
          onAction={dispatchAction}
          onBeginPlacement={setPlacingCardId}
        />
      </footer>
    </div>
  )
}
