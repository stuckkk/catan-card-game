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
  roomId: string
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

export function createHostSession(existingRoomId?: string): HostSession {
  const roomId = existingRoomId ?? makeRoomId()
  const room = joinRoom({ appId: APP_ID }, roomId)
  const stateAction = room.makeAction('state') as unknown as AnyMessage
  const actionAction = room.makeAction('action') as unknown as AnyMessage

  let actionHandler: ((a: GameAction) => void) | null = null
  let connectHandler: (() => void) | null = null
  let disconnectHandler: (() => void) | null = null
  let guestPeerId: string | null = null

  const baseUrl = window.location.href.split('#')[0]
  const inviteUrl = `${baseUrl}#join=${roomId}`

  // Adopt the newest peer to join. A reconnecting guest (page reload, network
  // blip) returns with a fresh peer id, so we always latch onto the latest one
  // and let the host re-send current state via onConnect.
  room.onPeerJoin = peerId => {
    guestPeerId = peerId
    connectHandler?.()
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

  // Adopt the newest peer as host so a host that reconnected (e.g. after a
  // reload) is picked up rather than ignored.
  room.onPeerJoin = peerId => {
    hostPeerId = peerId
    connectHandler?.()
  }

  room.onPeerLeave = peerId => {
    if (peerId === hostPeerId) {
      hostPeerId = null
      disconnectHandler?.()
    }
  }

  // Accept state from whichever peer is acting as host (covers the brief window
  // before onPeerJoin latches the id after a reconnect).
  stateAction.onMessage = (state: unknown, { peerId }: { peerId: string }) => {
    hostPeerId = peerId
    stateHandler?.(state as ProjectedState)
  }

  return {
    roomId,
    sendAction: action => {
      if (hostPeerId) actionAction.send(action as unknown as DataPayload, { target: hostPeerId })
    },
    onStateUpdate: cb => { stateHandler = cb },
    onConnect: cb => { connectHandler = cb },
    onDisconnect: cb => { disconnectHandler = cb },
    close: () => room.leave(),
  }
}
