import type { GameState, ProjectedState } from '../engine/types'

/**
 * Survives a page reload (sessionStorage, per-tab). Lets the Host recover the
 * authoritative Game State and the Guest re-render instantly, then both rejoin
 * the same Trystero room and resume. Cleared when a player returns to the lobby.
 */
const KEY = 'catan-duel-session'

export interface PersistedSession {
  role: 'host' | 'guest'
  roomId: string
  /** Host only: the full authoritative Game State. */
  hostState?: GameState
  /** Guest only: the last Projected State, for an instant re-render on reload. */
  guestProjected?: ProjectedState
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
