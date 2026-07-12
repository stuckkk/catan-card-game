import type { WebSocket } from 'ws'
import { applyAction as applyEngineAction, createInitialState } from '../../src/engine/engine'
import type { GameAction, GameState, PlayerId } from '../../src/engine/types'
import {
  DEFAULT_IDLE_TIMEOUT_MS, generateRoomId, generateToken,
  type Session,
} from './session'

export interface CreateSessionResult {
  roomId: string
  token: string
  playerId: 'host'
}

export type JoinSessionResult =
  | { ok: true; token: string; playerId: 'guest' }
  | { ok: false; code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' }

export type ReconnectResult =
  | { ok: true; playerId: PlayerId }
  | { ok: false; code: 'SESSION_EXPIRED' | 'INVALID_TOKEN' }

/**
 * In-memory registry of active sessions, keyed by roomId. Owns session lifecycle
 * (creation, join, reconnect, idle-timeout expiry) but knows nothing about the wire
 * protocol or how messages get sent — callers pass in sockets and read state back out.
 */
export class SessionManager {
  private sessions = new Map<string, Session>()

  constructor(private readonly idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS) {}

  createSession(vpTarget: number, language: 'en' | 'de', socket: WebSocket): CreateSessionResult {
    let roomId = generateRoomId()
    while (this.sessions.has(roomId)) roomId = generateRoomId()

    const token = generateToken()
    const state = createInitialState({ vpTarget, language })
    this.sessions.set(roomId, {
      roomId,
      state,
      createdAt: Date.now(),
      players: {
        host: { token, socket },
        guest: null,
      },
      idleTimer: null,
    })
    return { roomId, token, playerId: 'host' }
  }

  joinSession(roomId: string, socket: WebSocket): JoinSessionResult {
    const session = this.sessions.get(roomId)
    if (!session) return { ok: false, code: 'ROOM_NOT_FOUND' }
    if (session.players.guest) return { ok: false, code: 'ROOM_FULL' }

    const token = generateToken()
    session.players.guest = { token, socket }
    this.clearIdleTimer(session)
    return { ok: true, token, playerId: 'guest' }
  }

  reconnect(roomId: string, token: string, socket: WebSocket): ReconnectResult {
    const session = this.sessions.get(roomId)
    if (!session) return { ok: false, code: 'SESSION_EXPIRED' }

    const playerId = (['host', 'guest'] as const).find(id => session.players[id]?.token === token)
    if (!playerId) return { ok: false, code: 'INVALID_TOKEN' }

    session.players[playerId]!.socket = socket
    this.clearIdleTimer(session)
    return { ok: true, playerId }
  }

  /** Marks a player's socket as disconnected; starts the idle timer once nobody is connected.
   *  Used for both an unexpected socket close and an explicit `leave` message. */
  disconnect(roomId: string, playerId: PlayerId): void {
    const session = this.sessions.get(roomId)
    if (!session) return

    const player = session.players[playerId]
    if (player) player.socket = null

    const anyConnected = (['host', 'guest'] as const).some(id => session.players[id]?.socket)
    if (!anyConnected) this.startIdleTimer(roomId, session)
  }

  applyAction(roomId: string, actingPlayer: PlayerId, action: GameAction): GameState | null {
    const session = this.sessions.get(roomId)
    if (!session) return null
    session.state = applyEngineAction(session.state, actingPlayer, action)
    return session.state
  }

  getSession(roomId: string): Session | undefined {
    return this.sessions.get(roomId)
  }

  private clearIdleTimer(session: Session): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
  }

  private startIdleTimer(roomId: string, session: Session): void {
    if (session.idleTimer) return
    session.idleTimer = setTimeout(() => {
      this.sessions.delete(roomId)
    }, this.idleTimeoutMs)
    session.idleTimer.unref?.()
  }
}
