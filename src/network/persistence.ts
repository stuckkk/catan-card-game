import type { PlayerId } from '../engine/types'

/**
 * Survives a page reload (sessionStorage, per-tab). The server holds the authoritative
 * Game State, so all the browser needs to recover is which session/seat it was in and
 * the token to reconnect with — not a state snapshot. Cleared when a player returns to
 * the lobby.
 */
const KEY = 'catan-duel-session'

export interface PersistedSession {
  role: PlayerId
  roomId: string
  token: string
}

export function savePersisted(session: PersistedSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // sessionStorage may be unavailable (private mode, quota) — degrade silently.
  }
}

export function loadPersisted(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PersistedSession) : null
  } catch {
    return null
  }
}

export function clearPersisted(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
