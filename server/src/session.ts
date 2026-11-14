import { randomBytes, randomInt } from 'node:crypto'
import type { WebSocket } from 'ws'
import type { GameState, PlayerId } from '../../src/engine/types'

export interface SessionPlayer {
  token: string
  socket: WebSocket | null
}

export interface Session {
  roomId: string
  state: GameState
  createdAt: number
  /** Public sessions are listed in every lobby's Open Games list while waiting for a guest. */
  isPublic: boolean
  players: Record<PlayerId, SessionPlayer | null>
  /** After a game is over: who offered a rematch. It starts once the other player offers too. */
  rematchOfferedBy: PlayerId | null
  /** Set only while no player has a live socket; cleared on any connect/reconnect. */
  idleTimer: ReturnType<typeof setTimeout> | null
}

/** A session as written to disk when the server stops: everything but the live connections. */
export interface SessionSnapshot {
  roomId: string
  state: GameState
  createdAt: number
  isPublic: boolean
  tokens: Record<PlayerId, string | null>
  rematchOfferedBy: PlayerId | null
}

export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const DEFAULT_MAX_SESSIONS = 500

export function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

/** 6-char human-typeable room code. Excludes visually ambiguous characters (0/O, 1/I/L). */
const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomId(): string {
  let id = ''
  for (let i = 0; i < 6; i++) id += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)]
  return id
}
