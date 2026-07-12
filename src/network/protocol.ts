import type { GameAction, PlayerId, ProjectedState } from '../engine/types'

/** Messages a client sends to the server over the WebSocket connection. */
export type ClientMessage =
  | { type: 'create_session'; vpTarget: number; language: 'en' | 'de' }
  | { type: 'join_session'; roomId: string }
  | { type: 'reconnect'; roomId: string; token: string }
  | { type: 'action'; action: GameAction }
  | { type: 'leave' }

export type ServerErrorCode = 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'INVALID_TOKEN' | 'MALFORMED_MESSAGE'

/** Messages the server sends to a client over the WebSocket connection. */
export type ServerMessage =
  | { type: 'session_created'; roomId: string; token: string; playerId: PlayerId }
  | { type: 'session_joined'; roomId: string; token: string; playerId: PlayerId }
  | { type: 'reconnected'; playerId: PlayerId }
  | { type: 'state_update'; state: ProjectedState }
  | { type: 'peer_connected' }
  | { type: 'peer_disconnected' }
  | { type: 'session_expired' }
  | { type: 'error'; code: ServerErrorCode; message: string }
