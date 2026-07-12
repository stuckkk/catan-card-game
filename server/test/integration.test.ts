import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { WebSocket } from 'ws'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHttpServer } from '../src/httpServer'
import { attachWebSocketServer } from '../src/wsServer'
import { SessionManager } from '../src/sessionManager'
import type { ClientMessage, ServerMessage } from '../../src/network/protocol'

/** Buffers every message from connection time so waitFor never races a listener
 *  being attached after the message already arrived. */
interface Client {
  send: (message: ClientMessage) => void
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
    // Static serving isn't exercised by this test (only /ws traffic), so point it at any
    // real directory to satisfy sirv's eager directory scan.
    httpServer = createHttpServer(process.cwd())
    attachWebSocketServer(httpServer, new SessionManager())
    await new Promise<void>(resolve => httpServer.listen(0, resolve))
    port = (httpServer.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>(resolve => httpServer.close(() => resolve())))

  it('drives a full create -> join -> action -> reconnect flow', async () => {
    const host = await connect(port)
    host.send({ type: 'create_session', vpTarget: 12, language: 'en' })
    const created = await waitFor(host, 'session_created')
    expect(created.playerId).toBe('host')
    const hostInitialState = await waitFor(host, 'state_update')
    expect(hostInitialState.state.activePlayer).toBe('host')
    expect(typeof hostInitialState.state.players.guest.hand).toBe('number')
    expect(Array.isArray(hostInitialState.state.players.host.hand)).toBe(true)

    const guest = await connect(port)
    guest.send({ type: 'join_session', roomId: created.roomId })
    const joined = await waitFor(guest, 'session_joined')
    expect(joined.playerId).toBe('guest')
    await waitFor(guest, 'state_update')
    await waitFor(host, 'peer_connected')
    // Joining also broadcasts a (still pre-roll) state_update to the host - drain it so
    // the next state_update we wait for is unambiguously the post-roll one.
    await waitFor(host, 'state_update')

    // Host rolls the dice; both sides should receive the resulting state, each with
    // their own hand visible and the opponent's redacted to a count.
    host.send({ type: 'action', action: { type: 'ROLL_DICE' } })
    const hostView = await waitFor(host, 'state_update')
    const guestView = await waitFor(guest, 'state_update')
    expect(hostView.state.lastRoll).not.toBeNull()
    expect(guestView.state.lastRoll).toEqual(hostView.state.lastRoll)
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
    expect(resumedState.state.lastRoll).toEqual(hostView.state.lastRoll)

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
})
