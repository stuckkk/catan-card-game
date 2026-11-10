import type { GameState, PlayerId } from '../engine/types'

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

// ─── Local games (hot-seat, against the computer) ─────────────────────────────

/**
 * A local game runs the engine in this browser, so here the whole Game State is what a reload
 * has to bring back. Same lifetime as above: this tab, until the player returns to the lobby.
 */
const LOCAL_KEY = 'catan-duel-local-game'

export function saveLocalGame(state: GameState): void {
  try {
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(state))
  } catch {
    // Not remembered then: a reload starts the game over.
  }
}

/** The saved game `sessionId`, as it was after its last action; null if another (or no) game is saved. */
export function loadLocalGame(sessionId: string): GameState | null {
  try {
    const raw = sessionStorage.getItem(LOCAL_KEY)
    const state = raw ? (JSON.parse(raw) as GameState) : null
    return state?.sessionId === sessionId ? state : null
  } catch {
    return null
  }
}

export function clearLocalGame(): void {
  try {
    sessionStorage.removeItem(LOCAL_KEY)
  } catch {
    // ignore
  }
}
