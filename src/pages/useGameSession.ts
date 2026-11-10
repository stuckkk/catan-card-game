import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { applyAction, nextActor, normalizeRules, projectStateFor } from '../engine/engine'
import { botShouldAct, chooseBotAction } from '../engine/bot'
import type { GameState, GameAction, ProjectedState, PlayerId } from '../engine/types'
import { reconnectSession } from '../network/wsSession'
import type { NetworkSession } from '../network/wsSession'
import { sessionStore } from '../network/sessionStore'
import { loadLocalGame, loadPersisted, saveLocalGame } from '../network/persistence'
import { COMPUTER_DELAY_MS, useClientSettings } from '../settings/clientSettings'

export type ClientRole = 'host' | 'guest' | 'practice' | 'computer'

/** Against the computer, the human plays the host seat and the bot the guest seat. */
const COMPUTER_SEAT: PlayerId = 'guest'

/** Where the game comes from: the engine in this browser (practice, against the computer) or the
 *  server (host, guest). Either way the page gets the viewer's projected state and one way to act. */
export function useGameSession() {
  const location = useLocation()

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
  // history.state only holds the game as it started; a reload continues from the state saved
  // after its last action (saveLocalGame). Either may come from an older version without some
  // Game Settings: those fall back to the rulebook, as that game was played with.
  const [gameState, setGameState] = useState<GameState | null>(() => {
    const initial = nav.initialGameState
    if (!initial) return null
    const state = loadLocalGame(initial.sessionId) ?? initial
    return { ...state, config: { ...normalizeRules(state.config), language: state.config.language } }
  })
  const [projected, setProjected] = useState<ProjectedState | null>(null)
  const [disconnected, setDisconnected] = useState(false)
  const [expired, setExpired] = useState(false)
  // Our own connection to the server (online games); it reconnects by itself.
  const [reconnecting, setReconnecting] = useState(false)

  const sessionRef = useRef<NetworkSession | null>(sessionStore.get())
  // Pause before each computer move, so the player can follow what it does (a Client Setting).
  const computerDelay = COMPUTER_DELAY_MS[useClientSettings().computerSpeed]

  const isPractice = role === 'practice'
  // Practice and games against the computer run the engine in this browser.
  const isLocal = isPractice || role === 'computer'
  const myId: PlayerId = isPractice && gameState ? nextActor(gameState) : role === 'guest' ? 'guest' : 'host'

  const dispatchAction = useCallback((action: GameAction) => {
    if (role === 'practice' || role === 'computer') {
      setGameState(prev => (prev ? applyAction(prev, role === 'practice' ? nextActor(prev) : 'host', action) : prev))
    } else {
      sessionRef.current?.sendAction(action)
    }
  }, [role])

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
      session.onConnectionChange(connected => setReconnecting(!connected))
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

  // A local game lives only in this browser: keep it for a reload.
  useEffect(() => {
    if (isLocal && gameState) saveLocalGame(gameState)
  }, [isLocal, gameState])

  // The computer's moves: one at a time, after a short pause, whenever it has to act.
  useEffect(() => {
    if (role !== 'computer' || !gameState || !botShouldAct(gameState, COMPUTER_SEAT)) return
    const timer = setTimeout(() => setGameState(prev => {
      const action = prev && chooseBotAction(prev, COMPUTER_SEAT)
      return action ? applyAction(prev, COMPUTER_SEAT, action) : prev
    }), computerDelay)
    return () => clearTimeout(timer)
  }, [role, gameState, computerDelay])

  // A local game projects its state exactly like the server does, so the UI only ever
  // works off a ProjectedState.
  const view: ProjectedState | null = isLocal ? (gameState ? projectStateFor(gameState, myId) : null) : projected

  return { role, isPractice, myId, view, dispatchAction, disconnected, reconnecting, expired }
}
