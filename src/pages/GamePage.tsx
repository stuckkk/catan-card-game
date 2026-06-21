import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { applyAction, computeVP, projectForGuest, availableResources } from '../engine/engine'
import type { GameState, GameAction, ProjectedState, PlayerId, DeckId } from '../engine/types'
import { createHostSession, joinHostSession } from '../network/trysteroSession'
import type { HostSession, GuestSession } from '../network/trysteroSession'
import { sessionStore } from '../network/sessionStore'
import { savePersisted, clearPersisted, loadPersisted } from '../network/persistence'
import Principality from '../components/Principality'
import PhaseTracker from '../components/PhaseTracker'
import TradeMenu from '../components/TradeMenu'
import TradeOfferBanner from '../components/TradeOfferBanner'
import SwapPanel from '../components/SwapPanel'
import Hand from '../components/Hand'
import ResourceBar from '../components/ResourceBar'
import DiceDisplay from '../components/DiceDisplay'
import OpponentSummary from '../components/OpponentSummary'
import styles from './GamePage.module.css'

export default function GamePage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // Source of truth on first mount is the navigation state from the lobby. On a
  // page reload that state is gone, so we fall back to the persisted session.
  const nav = (location.state ?? {}) as {
    role?: 'host' | 'guest'
    initialGameState?: GameState
    projectedState?: ProjectedState
  }
  const persisted = nav.role ? null : loadPersisted()
  const role: 'host' | 'guest' | undefined = nav.role ?? persisted?.role

  const [gameState, setGameState] = useState<GameState | null>(
    nav.initialGameState ?? persisted?.hostState ?? null
  )
  const [projected, setProjected] = useState<ProjectedState | null>(
    nav.projectedState ?? persisted?.guestProjected ?? null
  )
  const [disconnected, setDisconnected] = useState(false)
  const [opponentExpanded, setOpponentExpanded] = useState(false)

  const hostSessionRef = useRef<HostSession | null>(sessionStore.getHost())
  const guestSessionRef = useRef<GuestSession | null>(sessionStore.getGuest())

  const myId: PlayerId = role === 'host' ? 'host' : 'guest'

  // Latest authoritative state, read when re-sending to a reconnecting guest.
  const gameStateRef = useRef(gameState)
  gameStateRef.current = gameState

  const dispatchAction = useCallback((action: GameAction) => {
    if (role === 'host') {
      setGameState(prev => {
        if (!prev) return prev
        const next = applyAction(prev, 'host', action)
        hostSessionRef.current?.sendState(projectForGuest(next))
        return next
      })
    } else {
      guestSessionRef.current?.sendAction(action)
    }
  }, [role])

  // Wire up (or rebuild, after a reload) the network session and its handlers.
  // Intentionally returns no cleanup that closes the room: React StrictMode
  // double-invokes effect cleanups in dev, which would tear down the live
  // connection the instant it opens. The room is closed only in leaveGame().
  useEffect(() => {
    if (!role) return

    if (role === 'host') {
      let host = sessionStore.getHost()
      if (!host && persisted?.roomId) {
        host = createHostSession(persisted.roomId)
        sessionStore.setHost(host)
      }
      if (!host) return
      hostSessionRef.current = host

      host.onAction(action => {
        setGameState(prev => {
          if (!prev) return prev
          const next = applyAction(prev, 'guest', action)
          host!.sendState(projectForGuest(next))
          return next
        })
      })
      host.onConnect(() => {
        setDisconnected(false)
        // Re-send current authoritative state to a (re)connecting guest.
        const current = gameStateRef.current
        if (current) host!.sendState(projectForGuest(current))
      })
      host.onDisconnect(() => setDisconnected(true))
    } else {
      let guest = sessionStore.getGuest()
      if (!guest && persisted?.roomId) {
        guest = joinHostSession(persisted.roomId)
        sessionStore.setGuest(guest)
      }
      if (!guest) return
      guestSessionRef.current = guest

      guest.onStateUpdate(state => {
        setProjected(state)
        setDisconnected(false)
        savePersisted({ role: 'guest', roomId: guest!.roomId, guestProjected: state })
      })
      guest.onConnect(() => setDisconnected(false))
      guest.onDisconnect(() => setDisconnected(true))
    }
  // persisted is derived from loadPersisted()/nav and stable for this mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  // Persist the Host's authoritative state on every change so a reload recovers.
  useEffect(() => {
    if (role !== 'host' || !gameState) return
    const roomId = hostSessionRef.current?.roomId
    if (roomId) savePersisted({ role: 'host', roomId, hostState: gameState })
  }, [gameState, role])

  function leaveGame() {
    sessionStore.getHost()?.close()
    sessionStore.getGuest()?.close()
    sessionStore.setHost(null)
    sessionStore.setGuest(null)
    clearPersisted()
    navigate('/')
  }

  const state = role === 'host' ? gameState : null
  const myState = role === 'host' ? gameState?.players.host : projected?.players.guest
  const myResources = myState ? availableResources(myState) : undefined
  const myHand = role === 'host'
    ? gameState?.players.host.hand ?? []
    : projected?.players.guest.hand ?? []

  const activePlayer = role === 'host' ? gameState?.activePlayer : projected?.activePlayer
  const isMyTurn = activePlayer === myId
  const phase = role === 'host' ? gameState?.phase : projected?.phase
  const lastRoll = role === 'host' ? gameState?.lastRoll : projected?.lastRoll
  const winner = role === 'host' ? gameState?.winner : projected?.winner
  const pendingTrade = role === 'host' ? gameState?.pendingTrade : projected?.pendingTrade
  const decks = (role === 'host' ? gameState?.decks : projected?.decks) as Record<DeckId, string[]> | undefined

  // VP for the local player, including Hero/Trade advantage tokens. Both
  // computations depend only on played cards (never hidden hands), so the Guest
  // can derive the full value from its Projected State.
  const myVP = role === 'host' && gameState
    ? computeVP(gameState, 'host')
    : projected
      ? computeVP(projected as unknown as GameState, 'guest')
      : 0

  if (!role || (!gameState && !projected)) {
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

      {/* Opponent summary (collapsed by default on mobile) */}
      <OpponentSummary
        expanded={opponentExpanded}
        onToggle={() => setOpponentExpanded(v => !v)}
        role={myId}
        gameState={state}
        projected={projected}
      />

      {/* My board */}
      <div className={styles.myBoard}>
        {myState && (
          <Principality
            principality={myState.principality}
            regions={myState.regions}
            isMyBoard
            phase={phase}
            isMyTurn={isMyTurn}
            onAction={dispatchAction}
          />
        )}
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
          cardIds={myHand as string[]}
          isMyTurn={isMyTurn}
          phase={phase}
          resources={myResources}
          onAction={dispatchAction}
        />

        {pendingTrade && (
          <TradeOfferBanner offer={pendingTrade} myId={myId} onAction={dispatchAction} />
        )}

        {phase === 'action' && isMyTurn && myResources && myState && (
          <TradeMenu
            resources={myResources}
            playedCards={myState.playedCards}
            offerPending={!!pendingTrade}
            onAction={dispatchAction}
          />
        )}

        {phase === 'swap' && isMyTurn && myResources && decks && (
          <SwapPanel
            hand={myHand as string[]}
            decks={decks}
            resources={myResources}
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
          {phase === 'swap' && isMyTurn && (
            <button className="secondary" onClick={() => dispatchAction({ type: 'SKIP_SWAP' })}>
              {t('game.skipSwap')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
