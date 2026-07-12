import type { WebSocket } from 'ws'
import { projectStateFor } from '../../src/engine/engine'
import type { PlayerId } from '../../src/engine/types'
import type { ClientMessage, ServerErrorCode, ServerMessage } from '../../src/network/protocol'
import type { SessionManager } from './sessionManager'
import { send } from './wsSend'

/** Per-connection state a WebSocket accumulates once it joins a session, tracked by wsServer. */
export interface ConnectionState {
  roomId: string | null
  playerId: PlayerId | null
}

const ERROR_MESSAGES: Record<ServerErrorCode, string> = {
  ROOM_NOT_FOUND: 'No session found for that room code.',
  ROOM_FULL: 'That session already has two players.',
  INVALID_TOKEN: 'Reconnect token was not recognized.',
  MALFORMED_MESSAGE: 'Malformed message.',
}

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === 'host' ? 'guest' : 'host'
}

function sendState(manager: SessionManager, roomId: string, viewer: PlayerId, socket: WebSocket): void {
  const session = manager.getSession(roomId)
  if (!session) return
  send(socket, { type: 'state_update', state: projectStateFor(session.state, viewer) })
}

function broadcastState(manager: SessionManager, roomId: string): void {
  const session = manager.getSession(roomId)
  if (!session) return
  for (const playerId of ['host', 'guest'] as const) {
    const socket = session.players[playerId]?.socket
    if (socket) sendState(manager, roomId, playerId, socket)
  }
}

export function notifyPeer(manager: SessionManager, roomId: string, playerId: PlayerId, message: ServerMessage): void {
  const session = manager.getSession(roomId)
  const opponentSocket = session?.players[opponentOf(playerId)]?.socket
  if (opponentSocket) send(opponentSocket, message)
}

function sendError(socket: WebSocket, code: ServerErrorCode): void {
  send(socket, { type: 'error', code, message: ERROR_MESSAGES[code] })
}

export function handleClientMessage(
  manager: SessionManager,
  socket: WebSocket,
  conn: ConnectionState,
  message: ClientMessage,
): void {
  switch (message.type) {
    case 'create_session': {
      const { roomId, token, playerId } = manager.createSession(message.vpTarget, message.language, socket)
      conn.roomId = roomId
      conn.playerId = playerId
      send(socket, { type: 'session_created', roomId, token, playerId })
      sendState(manager, roomId, playerId, socket)
      return
    }

    case 'join_session': {
      const result = manager.joinSession(message.roomId, socket)
      if (!result.ok) return sendError(socket, result.code)

      conn.roomId = message.roomId
      conn.playerId = result.playerId
      send(socket, { type: 'session_joined', roomId: message.roomId, token: result.token, playerId: result.playerId })
      broadcastState(manager, message.roomId)
      notifyPeer(manager, message.roomId, result.playerId, { type: 'peer_connected' })
      return
    }

    case 'reconnect': {
      const result = manager.reconnect(message.roomId, message.token, socket)
      if (!result.ok) {
        if (result.code === 'SESSION_EXPIRED') return send(socket, { type: 'session_expired' })
        return sendError(socket, result.code)
      }

      conn.roomId = message.roomId
      conn.playerId = result.playerId
      send(socket, { type: 'reconnected', playerId: result.playerId })
      sendState(manager, message.roomId, result.playerId, socket)
      notifyPeer(manager, message.roomId, result.playerId, { type: 'peer_connected' })
      return
    }

    case 'action': {
      if (!conn.roomId || !conn.playerId) return sendError(socket, 'MALFORMED_MESSAGE')

      const next = manager.applyAction(conn.roomId, conn.playerId, message.action)
      if (!next) return send(socket, { type: 'session_expired' })

      broadcastState(manager, conn.roomId)
      return
    }

    case 'leave': {
      if (conn.roomId && conn.playerId) {
        manager.disconnect(conn.roomId, conn.playerId)
        notifyPeer(manager, conn.roomId, conn.playerId, { type: 'peer_disconnected' })
      }
      return
    }
  }
}
