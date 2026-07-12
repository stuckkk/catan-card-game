import type { GameAction, PlayerId, ProjectedState } from '../engine/types'
import type { ClientMessage, ServerMessage } from './protocol'

export interface NetworkSession {
  roomId: string
  playerId: PlayerId
  /** Needed by the caller to persist for reconnecting after a full page reload. */
  token: string
  /** Set only for the session's creator (Host), built from the roomId at creation time. */
  inviteUrl?: string
  sendAction: (action: GameAction) => void
  onStateUpdate: (cb: (state: ProjectedState) => void) => void
  /** Fires when the *other* player (re)connects — not our own connection. */
  onPeerConnect: (cb: () => void) => void
  /** Fires when the *other* player disconnects — not our own connection. */
  onPeerDisconnect: (cb: () => void) => void
  onSessionExpired: (cb: () => void) => void
  onError: (cb: (err: { code: string; message: string }) => void) => void
  close: () => void
}

export class SessionFailure extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

interface Handlers {
  stateUpdate: ((state: ProjectedState) => void) | null
  peerConnect: (() => void) | null
  peerDisconnect: (() => void) | null
  sessionExpired: (() => void) | null
  error: ((err: { code: string; message: string }) => void) | null
}

const RECONNECT_DELAY_MS = 1000

/**
 * Owns one logical session's WebSocket connection, including transparent reconnection
 * after a transient network blip (using the token captured at construction time). The
 * app only ever sees `peer_connected`/`peer_disconnected` for the *other* player; our own
 * connection dropping and silently reconnecting is invisible unless it ultimately fails.
 */
class WsSession {
  private socket: WebSocket
  private closedByUser = false
  private handlers: Handlers = {
    stateUpdate: null, peerConnect: null, peerDisconnect: null, sessionExpired: null, error: null,
  }
  // The server pushes state_update proactively (at creation/join, and after every action) -
  // not on demand. A subscriber that registers after one already arrived (e.g. GamePage
  // mounting after LobbyPage consumed the first one just to trigger navigation) needs the
  // latest value replayed immediately, or it's stuck with nothing to render.
  private lastState: ProjectedState | null = null

  constructor(
    socket: WebSocket,
    private readonly roomId: string,
    private readonly token: string,
    public readonly playerId: PlayerId,
  ) {
    this.socket = socket
    this.wireSocket(socket)
  }

  private wireSocket(socket: WebSocket): void {
    socket.onmessage = event => this.handleMessage(JSON.parse(event.data))
    socket.onclose = () => {
      if (this.closedByUser) return
      setTimeout(() => this.attemptReconnect(), RECONNECT_DELAY_MS)
    }
  }

  private attemptReconnect(): void {
    const socket = new WebSocket(wsUrl())
    socket.onopen = () => {
      const message: ClientMessage = { type: 'reconnect', roomId: this.roomId, token: this.token }
      socket.send(JSON.stringify(message))
    }
    socket.onclose = () => {
      if (this.closedByUser) return
      setTimeout(() => this.attemptReconnect(), RECONNECT_DELAY_MS)
    }
    socket.onmessage = event => {
      const message: ServerMessage = JSON.parse(event.data)
      if (message.type === 'reconnected') {
        this.socket = socket
        this.wireSocket(socket)
      } else if (message.type === 'session_expired') {
        this.handlers.sessionExpired?.()
      } else if (message.type === 'error') {
        this.handlers.error?.({ code: message.code, message: message.message })
      }
    }
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'state_update':
        this.lastState = message.state
        this.handlers.stateUpdate?.(message.state)
        break
      case 'peer_connected':     this.handlers.peerConnect?.(); break
      case 'peer_disconnected':  this.handlers.peerDisconnect?.(); break
      case 'session_expired':    this.handlers.sessionExpired?.(); break
      case 'error':              this.handlers.error?.({ code: message.code, message: message.message }); break
      // session_created / session_joined / reconnected: only relevant during the initial
      // handshake, already consumed by createSession/joinSession/reconnectSession below.
    }
  }

  sendAction(action: GameAction): void {
    if (this.socket.readyState !== WebSocket.OPEN) return
    const message: ClientMessage = { type: 'action', action }
    this.socket.send(JSON.stringify(message))
  }

  close(): void {
    this.closedByUser = true
    if (this.socket.readyState === WebSocket.OPEN) {
      const message: ClientMessage = { type: 'leave' }
      this.socket.send(JSON.stringify(message))
    }
    this.socket.close()
  }

  toNetworkSession(inviteUrl?: string): NetworkSession {
    return {
      roomId: this.roomId,
      playerId: this.playerId,
      token: this.token,
      inviteUrl,
      sendAction: action => this.sendAction(action),
      onStateUpdate: cb => {
        this.handlers.stateUpdate = cb
        if (this.lastState) cb(this.lastState)
      },
      onPeerConnect: cb => { this.handlers.peerConnect = cb },
      onPeerDisconnect: cb => { this.handlers.peerDisconnect = cb },
      onSessionExpired: cb => { this.handlers.sessionExpired = cb },
      onError: cb => { this.handlers.error = cb },
      close: () => this.close(),
    }
  }
}

function handshake(
  send: ClientMessage, expectedSuccessType: ServerMessage['type'],
): Promise<{ socket: WebSocket; message: ServerMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl())
    socket.onopen = () => socket.send(JSON.stringify(send))
    socket.onerror = () => reject(new SessionFailure('UNREACHABLE', 'Could not reach the server.'))
    socket.onmessage = event => {
      const message: ServerMessage = JSON.parse(event.data)
      if (message.type === expectedSuccessType) {
        resolve({ socket, message })
      } else if (message.type === 'session_expired') {
        socket.close()
        reject(new SessionFailure('SESSION_EXPIRED', 'This session has ended.'))
      } else if (message.type === 'error') {
        socket.close()
        reject(new SessionFailure(message.code, message.message))
      }
    }
  })
}

export async function createSession(opts: { vpTarget: number; language: 'en' | 'de' }): Promise<NetworkSession> {
  const { socket, message } = await handshake(
    { type: 'create_session', vpTarget: opts.vpTarget, language: opts.language },
    'session_created',
  )
  const created = message as Extract<ServerMessage, { type: 'session_created' }>
  const session = new WsSession(socket, created.roomId, created.token, created.playerId)
  const baseUrl = window.location.href.split('#')[0]
  return session.toNetworkSession(`${baseUrl}#join=${created.roomId}`)
}

export async function joinSession(roomId: string): Promise<NetworkSession> {
  const { socket, message } = await handshake({ type: 'join_session', roomId }, 'session_joined')
  const joined = message as Extract<ServerMessage, { type: 'session_joined' }>
  const session = new WsSession(socket, joined.roomId, joined.token, joined.playerId)
  return session.toNetworkSession()
}

export async function reconnectSession(roomId: string, token: string, playerId: PlayerId): Promise<NetworkSession> {
  const { socket } = await handshake({ type: 'reconnect', roomId, token }, 'reconnected')
  const session = new WsSession(socket, roomId, token, playerId)
  return session.toNetworkSession()
}
