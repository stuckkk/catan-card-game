import { useSyncExternalStore } from 'react'
import { normalizeRules, STANDARD_RULES } from '../engine/engine'
import type { GameRules } from '../engine/types'

/** Client Settings: how this browser shows and plays the game. Never the rules, never the
 *  opponent's screen (CONTEXT.md). The language keeps its own key, see src/i18n/index.ts. */
export interface ClientSettings {
  computerSpeed: 'slow' | 'normal' | 'fast'
  /** Online games: vibrate and mark the tab title when it becomes my move. */
  turnAlert: boolean
  /** 'system' follows the device's reduced-motion setting. */
  motion: 'system' | 'on' | 'off'
  /** Off: an affordable build happens on the first tap, without the confirm dialog. */
  confirmBuilds: boolean
  toasts: 'normal' | 'short' | 'off'
}

export const DEFAULT_SETTINGS: ClientSettings = {
  computerSpeed: 'normal',
  turnAlert: true,
  motion: 'system',
  confirmBuilds: true,
  toasts: 'normal',
}

/** Pause before each computer move. */
export const COMPUTER_DELAY_MS: Record<ClientSettings['computerSpeed'], number> = { slow: 1400, normal: 700, fast: 250 }

/** How long a toast stays up: [plain line, event card with its effect text]. */
export const TOAST_MS: Record<Exclude<ClientSettings['toasts'], 'off'>, [number, number]> = {
  normal: [4500, 8000],
  short: [2500, 4500],
}

const SETTINGS_KEY = 'catan-duel-settings'
const LOBBY_KEY = 'catan-duel-lobby'

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Stored settings, checked: anything unknown or missing falls back to its default. */
export function parseSettings(raw: unknown): ClientSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    computerSpeed: oneOf(s.computerSpeed, ['slow', 'normal', 'fast'] as const, d.computerSpeed),
    turnAlert: typeof s.turnAlert === 'boolean' ? s.turnAlert : d.turnAlert,
    motion: oneOf(s.motion, ['system', 'on', 'off'] as const, d.motion),
    confirmBuilds: typeof s.confirmBuilds === 'boolean' ? s.confirmBuilds : d.confirmBuilds,
    toasts: oneOf(s.toasts, ['normal', 'short', 'off'] as const, d.toasts),
  }
}

// localStorage may be unavailable (private mode): then nothing is remembered, everything still works.
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not remembered then.
  }
}

/** The CSS reads <html data-motion> (src/index.css). */
function applyMotion(motion: ClientSettings['motion']) {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = motion
}

let current = parseSettings(readJson(SETTINGS_KEY))
applyMotion(current.motion)
const listeners = new Set<() => void>()

export function getSettings(): ClientSettings {
  return current
}

export function updateSettings(patch: Partial<ClientSettings>) {
  current = { ...current, ...patch }
  writeJson(SETTINGS_KEY, current)
  applyMotion(current.motion)
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The current settings; re-renders when they change (also from the in-game sheet). */
export function useClientSettings(): ClientSettings {
  return useSyncExternalStore(subscribe, getSettings)
}

// ─── Lobby memory ─────────────────────────────────────────────────────────────

/** Who the new game is against: an online opponent (by invite only, or anyone via the Open Games
 *  list), the computer, or nobody (hot-seat practice). */
export type Opponent = 'private' | 'public' | 'computer' | 'practice'

export interface LobbyChoices {
  opponent: Opponent
  rules: GameRules
}

/** The lobby's last choices, checked; the rules go through the same check as on the server. */
export function parseLobbyChoices(raw: unknown): LobbyChoices {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    opponent: oneOf(s.opponent, ['private', 'public', 'computer', 'practice'] as const, 'private'),
    rules: s.rules && typeof s.rules === 'object' ? normalizeRules(s.rules as Partial<GameRules>) : STANDARD_RULES,
  }
}

export function loadLobbyChoices(): LobbyChoices {
  return parseLobbyChoices(readJson(LOBBY_KEY))
}

export function saveLobbyChoices(choices: LobbyChoices) {
  writeJson(LOBBY_KEY, choices)
}
