import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { handleClientMessage, notifyPeer, type ConnectionState } from './protocolHandlers'
import { CreationLimiter } from './creationLimiter'
import type { SessionManager } from './sessionManager'
import { send } from './wsSend'

/** Far above any real message (an action is a few hundred bytes). */
const MAX_PAYLOAD_BYTES = 16 * 1024
const HEARTBEAT_MS = 30_000

export function attachWebSocketServer(
  httpServer: Server, sessionManager: SessionManager, limiter: CreationLimiter = new CreationLimiter(),
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: MAX_PAYLOAD_BYTES })

  // Heartbeat: a connection that did not answer the last ping is dead (a phone that lost its
  // network never says goodbye). The pings also keep proxies from cutting an idle connection.
  const alive = new WeakSet<WebSocket>()
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate()
        continue
      }
      alive.delete(socket)
      socket.ping()
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()
  wss.on('close', () => clearInterval(heartbeat))

  wss.on('connection', (socket, request) => {
    // Behind a reverse proxy every connection comes from the proxy, which names the client in
    // X-Forwarded-For. A client reaching the server directly can forge that header, which only
    // gets it around the per-address limit: MAX_SESSIONS still holds.
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
    const conn: ConnectionState = { roomId: null, playerId: null, address: forwarded || request.socket.remoteAddress || '' }
    alive.add(socket)
    socket.on('pong', () => alive.add(socket))
    // E.g. a message above the size limit: ws closes the connection, nothing else to do.
    socket.on('error', () => {})

    socket.on('message', raw => {
      // Whatever a client sends, it must never take the server (and every game on it) down.
      try {
        handleClientMessage(sessionManager, socket, conn, JSON.parse(raw.toString()), limiter)
      } catch {
        send(socket, { type: 'error', code: 'MALFORMED_MESSAGE', message: 'Malformed message.' })
      }
    })

    socket.on('close', () => {
      if (!conn.roomId || !conn.playerId) return
      // A socket already replaced by a reconnect leaves the seat (and the peer) alone.
      if (sessionManager.disconnect(conn.roomId, conn.playerId, socket)) {
        notifyPeer(sessionManager, conn.roomId, conn.playerId, { type: 'peer_disconnected' })
      }
    })
  })

  return wss
}
