import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { SessionManager } from '../src/sessionManager'

const IDLE_TIMEOUT_MS = 1000

function fakeSocket(): WebSocket {
  return {} as WebSocket
}

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager(IDLE_TIMEOUT_MS)
  })

  it('creates a session with a host token and a fresh initial state', () => {
    const result = manager.createSession(12, 'en', fakeSocket())
    expect(result.playerId).toBe('host')
    expect(result.roomId).toHaveLength(6)
    expect(result.token).toBeTruthy()

    const session = manager.getSession(result.roomId)
    expect(session?.state.config.vpTarget).toBe(12)
    expect(session?.players.guest).toBeNull()
  })

  it('lets a guest join an existing room', () => {
    const { roomId } = manager.createSession(12, 'en', fakeSocket())
    const result = manager.joinSession(roomId, fakeSocket())
    expect(result).toMatchObject({ ok: true, playerId: 'guest' })
  })

  it('rejects joining a room that does not exist', () => {
    const result = manager.joinSession('NOPE00', fakeSocket())
    expect(result).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' })
  })

  it('rejects a second guest joining an already-full room', () => {
    const { roomId } = manager.createSession(12, 'en', fakeSocket())
    manager.joinSession(roomId, fakeSocket())
    const second = manager.joinSession(roomId, fakeSocket())
    expect(second).toEqual({ ok: false, code: 'ROOM_FULL' })
  })

  it('reconnects a player who presents the correct token', () => {
    const { roomId, token } = manager.createSession(12, 'en', fakeSocket())
    manager.disconnect(roomId, 'host')
    const result = manager.reconnect(roomId, token, fakeSocket())
    expect(result).toEqual({ ok: true, playerId: 'host' })
  })

  it('rejects reconnect with an invalid token', () => {
    const { roomId } = manager.createSession(12, 'en', fakeSocket())
    const result = manager.reconnect(roomId, 'wrong-token', fakeSocket())
    expect(result).toEqual({ ok: false, code: 'INVALID_TOKEN' })
  })

  it('reports a missing room as SESSION_EXPIRED on reconnect (not ROOM_NOT_FOUND)', () => {
    const result = manager.reconnect('GHOST0', 'any-token', fakeSocket())
    expect(result).toEqual({ ok: false, code: 'SESSION_EXPIRED' })
  })

  it('applies an action through the engine and returns the updated state', () => {
    const { roomId } = manager.createSession(12, 'en', fakeSocket())
    const before = manager.getSession(roomId)!.state
    const next = manager.applyAction(roomId, before.activePlayer, { type: 'ROLL_DICE' })
    expect(next).not.toBeNull()
    expect(next!.lastRoll).not.toBeNull()
  })

  it('returns null from applyAction for an unknown room', () => {
    const next = manager.applyAction('GHOST0', 'host', { type: 'ROLL_DICE' })
    expect(next).toBeNull()
  })

  describe('idle-timeout expiry', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('deletes a session after the idle timeout once every player has disconnected', () => {
      const { roomId } = manager.createSession(12, 'en', fakeSocket())
      manager.disconnect(roomId, 'host')

      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1)
      expect(manager.getSession(roomId)).toBeDefined()

      vi.advanceTimersByTime(1)
      expect(manager.getSession(roomId)).toBeUndefined()
    })

    it('does not expire a session while any player is still connected', () => {
      const { roomId } = manager.createSession(12, 'en', fakeSocket())
      manager.joinSession(roomId, fakeSocket())
      manager.disconnect(roomId, 'host')

      vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2)
      expect(manager.getSession(roomId)).toBeDefined()
    })

    it('cancels the idle timer if the player reconnects in time', () => {
      const { roomId, token } = manager.createSession(12, 'en', fakeSocket())
      manager.disconnect(roomId, 'host')

      vi.advanceTimersByTime(IDLE_TIMEOUT_MS / 2)
      manager.reconnect(roomId, token, fakeSocket())

      vi.advanceTimersByTime(IDLE_TIMEOUT_MS)
      expect(manager.getSession(roomId)).toBeDefined()
    })

    it('treats an explicit leave the same as a disconnect (does not immediately kill the session)', () => {
      const { roomId } = manager.createSession(12, 'en', fakeSocket())
      manager.disconnect(roomId, 'host') // `leave` handling reuses disconnect()
      expect(manager.getSession(roomId)).toBeDefined()

      vi.advanceTimersByTime(IDLE_TIMEOUT_MS)
      expect(manager.getSession(roomId)).toBeUndefined()
    })
  })
})
