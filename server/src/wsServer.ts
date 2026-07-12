import type { Server } from 'node:http'
import { WebSocketServer } from 'ws'
import type { ClientMessage } from '../../src/network/protocol'
import { handleClientMessage, notifyPeer, type ConnectionState } from './protocolHandlers'
import type { SessionManager } from './sessionManager'
import { send } from './wsSend'

export function attachWebSocketServer(httpServer: Server, sessionManager: SessionManager): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', socket => {
    const conn: ConnectionState = { roomId: null, playerId: null }

    socket.on('message', raw => {
      let message: ClientMessage
      try {
        message = JSON.parse(raw.toString())
      } catch {
        send(socket, { type: 'error', code: 'MALFORMED_MESSAGE', message: 'Invalid JSON.' })
        return
      }
      handleClientMessage(sessionManager, socket, conn, message)
    })

    socket.on('close', () => {
      if (!conn.roomId || !conn.playerId) return
      sessionManager.disconnect(conn.roomId, conn.playerId)
      notifyPeer(sessionManager, conn.roomId, conn.playerId, { type: 'peer_disconnected' })
    })
  })

  return wss
}
