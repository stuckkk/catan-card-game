import { joinRoom } from '@trystero-p2p/torrent'
import type { MessageAction, DataPayload } from '@trystero-p2p/core'
import type { ProjectedState, GameAction } from '../engine/types'

const APP_ID = 'catan-card-game-v1'

export interface HostSession {
  roomId: string
  inviteUrl: string
  sendState: (state: ProjectedState) => void
  onAction: (cb: (action: GameAction) => void) => void
  onConnect: (cb: () => void) => void
  onDisconnect: (cb: () => void) => void
  close: () => void
}

export interface GuestSession {
  sendAction: (action: GameAction) => void
  onStateUpdate: (cb: (state: ProjectedState) => void) => void
  onConnect: (cb: () => void) => void
  onDisconnect: (cb: () => void) => void
  close: () => void
}

function makeRoomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map(b => b.toString(36))
    .join('')
}

// DataPayload requires an indexable JSON type which our interfaces don't satisfy at the type
// level, but our values are fully JSON-serializable — safe to cast via unknown.
type AnyMessage = MessageAction<DataPayload>

export function createHostSession(): HostSession {
  const roomId = makeRoomId()
  const room = joinRoom({ appId: APP_ID }, roomId)
  const stateAction = room.makeAction('state') as unknown as AnyMessage
  const actionAction = room.makeAction('action') as unknown as AnyMessage

  let actionHandler: ((a: GameAction) => void) | null = null
  let connectHandler: (() => void) | null = null
  let disconnectHandler: (() => void) | null = null
  let guestPeerId: string | null = null

  const baseUrl = window.location.href.split('#')[0]
  const inviteUrl = `${baseUrl}#join=${roomId}`

  room.onPeerJoin = peerId => {
    if (!guestPeerId) {
      guestPeerId = peerId
      connectHandler?.()
    }
  }

  room.onPeerLeave = peerId => {
    if (peerId === guestPeerId) {
      guestPeerId = null
      disconnectHandler?.()
    }
  }

  actionAction.onMessage = (action: unknown, { peerId }: { peerId: string }) => {
    if (peerId === guestPeerId) actionHandler?.(action as GameAction)
  }

  return {
    roomId,
    inviteUrl,
    sendState: state => {
      if (guestPeerId) stateAction.send(state as unknown as DataPayload, { target: guestPeerId })
    },
    onAction: cb => { actionHandler = cb },
    onConnect: cb => { connectHandler = cb },
    onDisconnect: cb => { disconnectHandler = cb },
    close: () => room.leave(),
  }
}

export function joinHostSession(roomId: string): GuestSession {
  const room = joinRoom({ appId: APP_ID }, roomId)
  const stateAction = room.makeAction('state') as unknown as AnyMessage
  const actionAction = room.makeAction('action') as unknown as AnyMessage

  let stateHandler: ((s: ProjectedState) => void) | null = null
  let connectHandler: (() => void) | null = null
  let disconnectHandler: (() => void) | null = null
  let hostPeerId: string | null = null

  room.onPeerJoin = peerId => {
    if (!hostPeerId) {
      hostPeerId = peerId
      connectHandler?.()
    }
  }

  room.onPeerLeave = peerId => {
    if (peerId === hostPeerId) {
      hostPeerId = null
      disconnectHandler?.()
    }
  }

  stateAction.onMessage = (state: unknown, { peerId }: { peerId: string }) => {
    if (peerId === hostPeerId) stateHandler?.(state as ProjectedState)
  }

  return {
    sendAction: action => {
      if (hostPeerId) actionAction.send(action as unknown as DataPayload, { target: hostPeerId })
    },
    onStateUpdate: cb => { stateHandler = cb },
    onConnect: cb => { connectHandler = cb },
    onDisconnect: cb => { disconnectHandler = cb },
    close: () => room.leave(),
  }
}
