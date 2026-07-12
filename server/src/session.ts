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
  players: Record<PlayerId, SessionPlayer | null>
  /** Set only while no player has a live socket; cleared on any connect/reconnect. */
  idleTimer: ReturnType<typeof setTimeout> | null
}

export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000

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
