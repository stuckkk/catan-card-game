import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { WebSocket } from 'ws'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHttpServer } from '../src/httpServer'
import { attachWebSocketServer } from '../src/wsServer'
import { SessionManager } from '../src/sessionManager'
import { STANDARD_RULES } from '../../src/engine/engine'
import type { ClientMessage, PublicGameSummary, ServerMessage } from '../../src/network/protocol'

/** Buffers every message from connection time so waitFor never races a listener
 *  being attached after the message already arrived. */
interface Client {
  send: (message: ClientMessage) => void
  /** Anything at all, as a broken or hostile client might send it. */
  sendRaw: (data: string) => void
  close: () => void
  received: ServerMessage[]
}

function connect(port: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`)
    const received: ServerMessage[] = []
    socket.on('message', raw => received.push(JSON.parse(raw.toString())))
    socket.once('open', () => resolve({
      received,
      send: message => socket.send(JSON.stringify(message)),
      sendRaw: data => socket.send(data),
      close: () => socket.close(),
    }))
    socket.once('error', reject)
  })
}

function waitFor<T extends ServerMessage['type']>(
  client: Client, type: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000
    const check = () => {
      const index = client.received.findIndex(m => m.type === type)
      if (index !== -1) {
        const [message] = client.received.splice(index, 1)
        resolve(message as Extract<ServerMessage, { type: T }>)
        return
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for "${type}"`))
        return
      }
      setTimeout(check, 10)
    }
    check()
  })
}

describe('server integration: host/guest game over real WebSocket connections', () => {
  let httpServer: Server
  let port: number

  beforeAll(async () => {
    const sessionManager = new SessionManager()
    // Static serving isn't exercised by this test (only /ws and /api traffic), so point it
    // at any real directory to satisfy sirv's eager directory scan.
    httpServer = createHttpServer(sessionManager, process.cwd())
    attachWebSocketServer(httpServer, sessionManager)
    await new Promise<void>(resolve => httpServer.listen(0, resolve))
    port = (httpServer.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>(resolve => httpServer.close(() => resolve())))

  it('drives a full create -> join -> action -> reconnect flow', async () => {
    const host = await connect(port)
    host.send({ type: 'create_session', rules: { ...STANDARD_RULES, vpTarget: 12 }, language: 'en', isPublic: false })
    const created = await waitFor(host, 'session_created')
    expect(created.playerId).toBe('host')
    const hostInitialState = await waitFor(host, 'state_update')
    expect(hostInitialState.state.phase).toBe('setup')
    expect('decks' in hostInitialState.state).toBe(false)
    expect(hostInitialState.state.deckSizes['stack-1']).toBeGreaterThan(0)
    expect(typeof hostInitialState.state.players.guest.hand).toBe('number')
    expect(Array.isArray(hostInitialState.state.players.host.hand)).toBe(true)

    const guest = await connect(port)
    guest.send({ type: 'join_session', roomId: created.roomId })
    const joined = await waitFor(guest, 'session_joined')
    expect(joined.playerId).toBe('guest')
    await waitFor(guest, 'state_update')
    await waitFor(host, 'peer_connected')
    // Joining also broadcasts a (still setup) state_update to the host - drain it so
    // the next state_update we wait for is unambiguously the one after the action.
    await waitFor(host, 'state_update')

    // The first player opens a stack for their starting cards; both sides receive the
    // resulting state, but only the searcher sees the stack's contents.
    const first = hostInitialState.state.setup.firstPlayer
    const searcher = first === 'host' ? host : guest
    searcher.send({ type: 'action', action: { type: 'SEARCH_STACK', deck: 'stack-1' } })
    const hostView = await waitFor(host, 'state_update')
    const guestView = await waitFor(guest, 'state_update')
    expect(hostView.state.search).toEqual({ player: first, deck: 'stack-1', purpose: 'setup' })
    expect(guestView.state.search).toEqual(hostView.state.search)
    const [searcherView, otherView] = first === 'host' ? [hostView, guestView] : [guestView, hostView]
    expect(searcherView.state.searchContents?.length).toBeGreaterThan(0)
    expect(otherView.state.searchContents).toBeNull()
    expect(Array.isArray(hostView.state.players.host.hand)).toBe(true)
    expect(typeof hostView.state.players.guest.hand).toBe('number')
    expect(Array.isArray(guestView.state.players.guest.hand)).toBe(true)
    expect(typeof guestView.state.players.host.hand).toBe('number')

    // Guest disconnects and reconnects with its token; state should resume unchanged.
    guest.close()
    await waitFor(host, 'peer_disconnected')

    const reconnected1 = await connect(port)
    reconnected1.send({ type: 'reconnect', roomId: created.roomId, token: joined.token })
    const reconnected = await waitFor(reconnected1, 'reconnected')
    expect(reconnected.playerId).toBe('guest')
    const resumedState = await waitFor(reconnected1, 'state_update')
    expect(resumedState.state.search).toEqual(hostView.state.search)

    host.close()
    reconnected1.close()
  })

  it('rejects joining an unknown room and reconnecting to an unknown room', async () => {
    const client = await connect(port)
    client.send({ type: 'join_session', roomId: 'ZZZZZZ' })
    const error = await waitFor(client, 'error')
    expect(error.code).toBe('ROOM_NOT_FOUND')

    client.send({ type: 'reconnect', roomId: 'ZZZZZZ', token: 'nope' })
    await waitFor(client, 'session_expired')

    client.close()
  })

  it('lists public sessions waiting for a guest at /api/games, never private ones', async () => {
    const listedRoomIds = async () => {
      const res = await fetch(`http://localhost:${port}/api/games`)
      expect(res.headers.get('content-type')).toContain('application/json')
      const games = (await res.json()) as PublicGameSummary[]
      return games.map(g => g.roomId)
    }

    const publicHost = await connect(port)
    publicHost.send({ type: 'create_session', rules: { ...STANDARD_RULES, vpTarget: 13 }, language: 'en', isPublic: true })
    const publicRoom = await waitFor(publicHost, 'session_created')

    const privateHost = await connect(port)
    privateHost.send({ type: 'create_session', rules: { ...STANDARD_RULES, vpTarget: 12 }, language: 'en', isPublic: false })
    const privateRoom = await waitFor(privateHost, 'session_created')

    const listed = await listedRoomIds()
    expect(listed).toContain(publicRoom.roomId)
    expect(listed).not.toContain(privateRoom.roomId)

    const guest = await connect(port)
    guest.send({ type: 'join_session', roomId: publicRoom.roomId })
    await waitFor(guest, 'session_joined')
    expect(await listedRoomIds()).not.toContain(publicRoom.roomId)

    publicHost.close()
    privateHost.close()
    guest.close()
  })

  it('deletes a session whose host leaves before a guest joined', async () => {
    const host = await connect(port)
    host.send({ type: 'create_session', rules: { ...STANDARD_RULES, vpTarget: 12 }, language: 'en', isPublic: true })
    const created = await waitFor(host, 'session_created')
    host.send({ type: 'leave' })

    const guest = await connect(port)
    guest.send({ type: 'join_session', roomId: created.roomId })
    const error = await waitFor(guest, 'error')
    expect(error.code).toBe('ROOM_NOT_FOUND')

    host.close()
    guest.close()
  })

  it('answers malformed messages with an error and keeps running', async () => {
    const host = await connect(port)
    host.send({ type: 'create_session', rules: STANDARD_RULES, language: 'en', isPublic: false })
    const created = await waitFor(host, 'session_created')
    await waitFor(host, 'state_update')
    const guest = await connect(port)
    guest.send({ type: 'join_session', roomId: created.roomId })
    await waitFor(guest, 'session_joined')

    const malformed = [
      'not json',
      'null',
      '42',
      '{}',
      '{"type":"action"}',
      '{"type":"action","action":null}',
      '{"type":"action","action":{"type":"CHOOSE_HAND_CARDS"}}',
      '{"type":"action","action":{"type":"TAKE_FROM_SEARCH"}}',
      '{"type":"action","action":{"type":"DISCARD_TO_LIMIT"}}',
      '{"type":"action","action":{"type":"PROPOSE_TRADE"}}',
      '{"type":"join_session"}',
      '{"type":"reconnect"}',
    ]
    for (const data of malformed) {
      host.sendRaw(data)
      guest.sendRaw(data)
    }

    // Still serving: a new client gets a proper answer, and the game is still there.
    const other = await connect(port)
    other.send({ type: 'join_session', roomId: created.roomId })
    expect((await waitFor(other, 'error')).code).toBe('ROOM_FULL')
    expect(host.received.some(m => m.type === 'error' && m.code === 'MALFORMED_MESSAGE')).toBe(true)

    host.close()
    guest.close()
    other.close()
  })

  it('refuses a second session on a connection that already has a seat', async () => {
    const host = await connect(port)
    host.send({ type: 'create_session', rules: STANDARD_RULES, language: 'en', isPublic: false })
    await waitFor(host, 'session_created')
    host.send({ type: 'create_session', rules: STANDARD_RULES, language: 'en', isPublic: false })
    expect((await waitFor(host, 'error')).code).toBe('MALFORMED_MESSAGE')
    host.close()
  })

  it('answers the health check and the games list with a query string', async () => {
    expect(await (await fetch(`http://localhost:${port}/healthz?probe=1`)).text()).toBe('ok')
    const games = await fetch(`http://localhost:${port}/api/games?t=1`)
    expect(games.headers.get('content-type')).toContain('application/json')
  })
})
