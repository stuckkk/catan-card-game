import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { applyAction, computePlayerStats, computeVP, projectForGuest } from '../engine/engine'
import type { GameState, GameAction, ProjectedState, PlayerId } from '../engine/types'
import type { HostSession, GuestSession } from '../network/trysteroSession'
import { sessionStore } from '../network/sessionStore'
import Principality from '../components/Principality'
import Hand from '../components/Hand'
import ResourceBar from '../components/ResourceBar'
import DiceDisplay from '../components/DiceDisplay'
import OpponentSummary from '../components/OpponentSummary'
import styles from './GamePage.module.css'

export default function GamePage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  const { role, initialGameState, projectedState: initialProjected } =
    (location.state ?? {}) as {
      role?: 'host' | 'guest'
      initialGameState?: GameState
      projectedState?: ProjectedState
    }

  const [gameState, setGameState] = useState<GameState | null>(initialGameState ?? null)
  const [projected, setProjected] = useState<ProjectedState | null>(initialProjected ?? null)
  const [disconnected, setDisconnected] = useState(false)
  const [opponentExpanded, setOpponentExpanded] = useState(false)

  const hostSessionRef = useRef<HostSession | null>(sessionStore.getHost())
  const guestSessionRef = useRef<GuestSession | null>(sessionStore.getGuest())

  const myId: PlayerId = role === 'host' ? 'host' : 'guest'

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

  useEffect(() => {
    const guestSession = guestSessionRef.current
    if (!guestSession) return

    guestSession.onStateUpdate(state => {
      setProjected(state)
      setDisconnected(false)
    })
    guestSession.onDisconnect(() => setDisconnected(true))
    guestSession.onConnect(() => setDisconnected(false))

    return () => guestSession.close()
  }, [])

  useEffect(() => {
    const hostSession = hostSessionRef.current
    if (!hostSession) return

    hostSession.onAction(action => {
      setGameState(prev => {
        if (!prev) return prev
        const next = applyAction(prev, 'guest', action)
        hostSession.sendState(projectForGuest(next))
        return next
      })
    })
    hostSession.onDisconnect(() => setDisconnected(true))
    hostSession.onConnect(() => setDisconnected(false))

    return () => hostSession.close()
  }, [])

  const state = role === 'host' ? gameState : null
  const myState = role === 'host' ? gameState?.players.host : projected?.players.guest
  const myResources = myState?.resources
  const myHand = role === 'host'
    ? gameState?.players.host.hand ?? []
    : projected?.players.guest.hand ?? []

  const activePlayer = role === 'host' ? gameState?.activePlayer : projected?.activePlayer
  const isMyTurn = activePlayer === myId
  const phase = role === 'host' ? gameState?.phase : projected?.phase
  const lastRoll = role === 'host' ? gameState?.lastRoll : projected?.lastRoll
  const winner = role === 'host' ? gameState?.winner : projected?.winner

  const myVP = role === 'host' && gameState
    ? computeVP(gameState, 'host')
    : projected?.players.guest
      ? (() => {
          // Guest computes VP from their own stats, advantages tracked by host
          const stats = computePlayerStats(projected.players.guest)
          return stats.victoryPoints
        })()
      : 0

  if (!gameState && !projected) {
    return (
      <div className={styles.page}>
        <p>{t('lobby.connecting')}</p>
        <button className="secondary" onClick={() => navigate('/')}>{t('game.backToLobby')}</button>
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
            <button className="primary" onClick={() => navigate('/')}>{t('game.backToLobby')}</button>
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
          <span className={styles.phase}>{t(`game.phase.${phase}`)}</span>
          <span className={styles.vp}>{t('game.currentVP', { count: myVP })}</span>
        </div>

        {myResources && <ResourceBar resources={myResources} />}

        {lastRoll && <DiceDisplay roll={lastRoll} />}

        <Hand
          cardIds={myHand as string[]}
          isMyTurn={isMyTurn}
          phase={phase}
          resources={myResources}
          onAction={dispatchAction}
        />

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
