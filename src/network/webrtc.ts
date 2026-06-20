import type { HostMessage, GuestMessage, GameAction, ProjectedState } from '../engine/types'

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const ICE_GATHER_TIMEOUT_MS = 5000
const RECONNECT_TIMEOUT_MS = 60_000
const PING_INTERVAL_MS = 5000

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function gatherIceCandidates(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      // Resolve with whatever we have — partial ICE is often enough
      if (pc.localDescription) resolve(pc.localDescription)
      else reject(new Error('ICE gathering timed out with no local description'))
    }, ICE_GATHER_TIMEOUT_MS)

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout)
        resolve(pc.localDescription!)
      }
    }
  })
}

function encodeDescription(desc: RTCSessionDescriptionInit): string {
  return btoa(JSON.stringify(desc))
}

function decodeDescription(encoded: string): RTCSessionDescriptionInit {
  return JSON.parse(atob(encoded))
}

export function encodeOfferToUrl(offer: RTCSessionDescriptionInit, baseUrl: string): string {
  const hash = encodeURIComponent(encodeDescription(offer))
  return `${baseUrl}#join=${hash}`
}

export function decodeOfferFromUrl(url: string): RTCSessionDescriptionInit | null {
  try {
    const hash = new URL(url).hash
    const match = hash.match(/^#join=(.+)/)
    if (!match) return null
    return decodeDescription(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

export function encodeAnswer(answer: RTCSessionDescriptionInit): string {
  return encodeDescription(answer)
}

export function decodeAnswer(encoded: string): RTCSessionDescriptionInit {
  return decodeDescription(encoded)
}

// ─── Host Session ─────────────────────────────────────────────────────────────

export interface HostSession {
  /** Base64 encoded offer — embed in the invite URL */
  offerCode: string
  /** Full invite URL with offer embedded in hash */
  inviteUrl: string
  /** Call with Guest's answer code to complete the handshake */
  acceptAnswer: (answerCode: string) => Promise<void>
  /** Send the projected state to the guest */
  sendState: (state: ProjectedState) => void
  /** Receive an action from the guest */
  onAction: (cb: (action: GameAction) => void) => void
  /** Called when guest connects/reconnects */
  onConnect: (cb: () => void) => void
  /** Called when guest disconnects */
  onDisconnect: (cb: () => void) => void
  close: () => void
}

export async function createHostSession(): Promise<HostSession> {
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS })
  const channel = pc.createDataChannel('game', { ordered: true })

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const fullOffer = await gatherIceCandidates(pc)

  const offerCode = encodeDescription(fullOffer)
  const inviteUrl = encodeOfferToUrl(fullOffer, window.location.href.split('#')[0])

  let actionHandler: ((action: GameAction) => void) | null = null
  let connectHandler: (() => void) | null = null
  let disconnectHandler: (() => void) | null = null
  let pingInterval: ReturnType<typeof setInterval> | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  channel.onopen = () => {
    connectHandler?.()
    pingInterval = setInterval(() => {
      if (channel.readyState === 'open') {
        const msg: HostMessage = { type: 'PING' }
        channel.send(JSON.stringify(msg))
      }
    }, PING_INTERVAL_MS)
  }

  channel.onclose = () => {
    if (pingInterval) clearInterval(pingInterval)
    disconnectHandler?.()
    reconnectTimeout = setTimeout(() => {
      // Guest did not reconnect within the window — surface as permanent disconnect
      disconnectHandler?.()
    }, RECONNECT_TIMEOUT_MS)
  }

  channel.onmessage = (e) => {
    const msg: GuestMessage = JSON.parse(e.data as string)
    if (msg.type === 'ACTION') actionHandler?.(msg.action)
    if (msg.type === 'RECONNECTED') {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      connectHandler?.()
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      disconnectHandler?.()
    }
  }

  return {
    offerCode,
    inviteUrl,
    acceptAnswer: async (answerCode: string) => {
      const answer = decodeAnswer(answerCode)
      await pc.setRemoteDescription(answer)
    },
    sendState: (state: ProjectedState) => {
      if (channel.readyState !== 'open') return
      const msg: HostMessage = { type: 'STATE_UPDATE', state }
      channel.send(JSON.stringify(msg))
    },
    onAction: (cb) => { actionHandler = cb },
    onConnect: (cb) => { connectHandler = cb },
    onDisconnect: (cb) => { disconnectHandler = cb },
    close: () => {
      if (pingInterval) clearInterval(pingInterval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      channel.close()
      pc.close()
    },
  }
}

// ─── Guest Session ────────────────────────────────────────────────────────────

export interface GuestSession {
  /** Base64 encoded answer — share back to the host */
  answerCode: string
  /** Send an action to the host */
  sendAction: (action: GameAction) => void
  /** Receive state updates from the host */
  onStateUpdate: (cb: (state: ProjectedState) => void) => void
  /** Called when connection to host is established */
  onConnect: (cb: () => void) => void
  /** Called when connection to host is lost */
  onDisconnect: (cb: () => void) => void
  close: () => void
}

export async function joinHostSession(offerCodeOrUrl: string): Promise<GuestSession> {
  const description: RTCSessionDescriptionInit =
    offerCodeOrUrl.startsWith('http') || offerCodeOrUrl.startsWith('#')
      ? (() => {
          const d = decodeOfferFromUrl(offerCodeOrUrl.startsWith('#') ? window.location.href : offerCodeOrUrl)
          if (!d) throw new Error('Invalid invite URL')
          return d
        })()
      : decodeDescription(offerCodeOrUrl)

  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS })

  await pc.setRemoteDescription(description)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  const fullAnswer = await gatherIceCandidates(pc)

  const answerCode = encodeDescription(fullAnswer)

  let stateHandler: ((state: ProjectedState) => void) | null = null
  let connectHandler: (() => void) | null = null
  let disconnectHandler: (() => void) | null = null
  let channel: RTCDataChannel | null = null

  pc.ondatachannel = (e) => {
    channel = e.channel

    channel.onopen = () => {
      connectHandler?.()
      // Announce reconnection so host can re-send state
      const msg: GuestMessage = { type: 'RECONNECTED' }
      ;(e.channel).send(JSON.stringify(msg))
    }

    channel.onclose = () => {
      disconnectHandler?.()
    }

    channel.onmessage = (ev) => {
      const msg: HostMessage = JSON.parse(ev.data as string)
      if (msg.type === 'STATE_UPDATE') stateHandler?.(msg.state)
      // PING is intentionally ignored — connection alive signal only
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      disconnectHandler?.()
    }
  }

  return {
    answerCode,
    sendAction: (action: GameAction) => {
      if (channel?.readyState !== 'open') return
      const msg: GuestMessage = { type: 'ACTION', action }
      channel.send(JSON.stringify(msg))
    },
    onStateUpdate: (cb) => { stateHandler = cb },
    onConnect: (cb) => { connectHandler = cb },
    onDisconnect: (cb) => { disconnectHandler = cb },
    close: () => {
      channel?.close()
      pc.close()
    },
  }
}
