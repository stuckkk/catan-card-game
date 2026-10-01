import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  applyAction, computeVP, availableResources, computePlayerStats, projectStateFor, setupChooser,
  actionCardsUnlocked, searchCost,
} from '../engine/engine'
import { getCard } from '../engine/cards'
import type { GameState, GameAction, ProjectedState, PlayerId, PlayerState } from '../engine/types'
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
  const opponentResources = opponentState ? availableResources(opponentState as unknown as PlayerState) : undefined

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

  // VP for the local player, including the Knight/Windmill tokens (public board state only).
  const myVP = view ? computeVP(view, myId) : 0

  // Placement is only valid during my own action phase; abandon it otherwise.
  useEffect(() => {
    if (placingCardId && !(isMyTurn && phase === 'action')) setPlacingCardId(null)
  }, [placingCardId, isMyTurn, phase])

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
            <button className="primary" onClick={leaveGame}>{t('game.backToLobby')}</button>
          </div>
        </div>
      )}

      {/* Opponent summary (collapsed by default on mobile), full width, with the village
          thumbnail stacked below it so the thumbnail never collides with the summary's
          expandable detail panel growing underneath the toggle. */}
      <div className={styles.topBar}>
        <OpponentSummary
          expanded={opponentExpanded}
          onToggle={() => setOpponentExpanded(v => !v)}
          myId={myId}
          view={view}
        />

        {opponentState && (
          <OpponentVillage
            principality={opponentState.principality}
            regions={opponentState.regions}
          />
        )}
      </div>

      {placingCardId && (
        <div className={styles.placingBanner}>
          <span>{t('game.placing', { card: t(getCard(placingCardId).nameKey) })}</span>
          <button className="secondary" onClick={() => setPlacingCardId(null)}>
            {t('game.cancelPlacement')}
          </button>
        </div>
      )}

      {/* My board */}
      <div className={styles.myBoard}>
        <div className={styles.boardInner}>
          {myState && (
            <Principality
              principality={myState.principality}
              regions={myState.regions}
              isMyBoard
              phase={phase}
              isMyTurn={isMyTurn}
              placingCardId={placingCardId}
              onAction={handleBoardAction}
              canArrange={phase === 'setup' && !view.setup.picked[myId]}
              hasScout={myHand.includes('scout')}
              regionStack={view.regionStack}
              resources={myResources}
              supply={view.supply}
            />
          )}
        </div>
      </div>

      {/* Bottom panel: hand + controls */}
      <div className={styles.bottomPanel}>
        <div className={styles.statusBar}>
          <span className={isMyTurn ? styles.myTurn : styles.theirTurn}>
            {isMyTurn ? t('game.yourTurn') : t('game.opponentTurn')}
          </span>
          <span className={styles.vp}>{t('game.currentVP', { count: myVP })}</span>
        </div>
        <PhaseTracker phase={phase} isMyTurn={isMyTurn} />

        {myResources && <ResourceBar resources={myResources} />}

        {lastRoll && <DiceDisplay roll={lastRoll} />}

        <Hand
          cardIds={myHand}
          isMyTurn={isMyTurn}
          phase={phase}
          resources={myResources}
          opponentResources={opponentResources}
          actionsUnlocked={actionCardsUnlocked(view)}
          onAction={dispatchAction}
          onBeginPlacement={setPlacingCardId}
        />

        {pendingTrade && (
          <TradeOfferBanner offer={pendingTrade} myId={myId} onAction={dispatchAction} />
        )}

        {myChoice && <ResourceChoiceModal choice={myChoice} onAction={dispatchAction} />}

        {activeChoice && !myChoice && (
          <div className={styles.choiceWaiting}>{t('game.chooseResource.waiting')}</div>
        )}

        {phase === 'action' && isMyTurn && myResources && myState && (
          <TradeMenu
            resources={myResources}
            playedCards={myState.playedCards}
            offerPending={!!pendingTrade}
            onAction={dispatchAction}
          />
        )}

        {phase === 'setup' && <SetupPanel view={view} myId={myId} onAction={dispatchAction} />}

        {mySearch && view.searchContents && (
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

        <div className={styles.controls}>
          {phase === 'roll' && isMyTurn && (
            <button className="primary" onClick={() => dispatchAction({ type: 'ROLL_DICE' })}>
              {t('game.rollDice')}
            </button>
          )}
          {phase === 'action' && isMyTurn && (
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
      </div>
    </div>
  )
}
