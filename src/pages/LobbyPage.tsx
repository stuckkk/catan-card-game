import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createSession, fetchPublicGames, joinSession, SessionFailure } from '../network/wsSession'
import type { NetworkSession } from '../network/wsSession'
import type { PublicGameSummary } from '../network/protocol'
import { sessionStore } from '../network/sessionStore'
import { clearPersisted, savePersisted } from '../network/persistence'
import { createInitialState, hasCustomRules, STANDARD_RULES } from '../engine/engine'
import { loadLobbyChoices, saveLobbyChoices } from '../settings/clientSettings'
import type { Opponent } from '../settings/clientSettings'
import type { GameRules, Language } from '../engine/types'
import HelpButton from '../components/HelpButton'
import GameRulesSheet from '../components/GameRulesSheet'
import SettingsButton from '../components/SettingsButton'
import type { ClientRole } from './useGameSession'
import styles from './LobbyPage.module.css'

type LobbyMode = 'idle' | 'hosting' | 'joining' | 'error'
type ErrorKey = 'connectionLost' | 'roomNotFound' | 'sessionExpired' | 'serverUnreachable'

const OPPONENTS: { value: Opponent; icon: string; labelKey: string; hintKey: string }[] = [
  { value: 'private', icon: '👥', labelKey: 'lobby.opponentPrivate', hintKey: 'lobby.opponentPrivateHint' },
  { value: 'public', icon: '🌍', labelKey: 'lobby.opponentPublic', hintKey: 'lobby.opponentPublicHint' },
  { value: 'computer', icon: '🤖', labelKey: 'lobby.opponentComputer', hintKey: 'lobby.opponentComputerHint' },
  { value: 'practice', icon: '🪑', labelKey: 'lobby.opponentPractice', hintKey: 'lobby.opponentPracticeHint' },
]

const PUBLIC_GAMES_REFRESH_MS = 5_000

function errorKeyForCode(code: string): ErrorKey {
  switch (code) {
    case 'ROOM_NOT_FOUND': return 'roomNotFound'
    case 'SESSION_EXPIRED': return 'sessionExpired'
    case 'UNREACHABLE': return 'serverUnreachable'
    default: return 'connectionLost'
  }
}

export default function LobbyPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [mode, setMode] = useState<LobbyMode>('idle')
  // The last opponent and Game Settings come back on the next visit (this browser only).
  const [remembered] = useState(loadLobbyChoices)
  const [rules, setRules] = useState<GameRules>(remembered.rules)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [opponent, setOpponent] = useState<Opponent>(remembered.opponent)
  const [inviteUrl, setInviteUrl] = useState('')
  const [manualRoomId, setManualRoomId] = useState('')
  const [copied, setCopied] = useState(false)
  const [errorKey, setErrorKey] = useState<ErrorKey>('connectionLost')
  const [publicGames, setPublicGames] = useState<PublicGameSummary[]>([])
  const [listFailed, setListFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => saveLobbyChoices({ opponent, rules }), [opponent, rules])

  // Auto-join when arriving via invite link - also when it's pasted into a tab that already
  // shows the lobby: only the #hash changes then, so the page isn't reloaded.
  useEffect(() => {
    function joinFromHash() {
      const match = window.location.hash.match(/^#join=(.+)/)
      if (match) {
        handleJoin(match[1])
      }
    }
    joinFromHash()
    window.addEventListener('hashchange', joinFromHash)
    return () => window.removeEventListener('hashchange', joinFromHash)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshPublicGames = useCallback(async () => {
    try {
      setPublicGames(await fetchPublicGames())
      setListFailed(false)
    } catch {
      setListFailed(true)
    }
  }, [])

  // The Open Games list only matters on the idle lobby screen: refresh it on arrival and then
  // every few seconds, and stop as soon as the player hosts, joins or hits an error.
  useEffect(() => {
    if (mode !== 'idle') return
    refreshPublicGames()
    const timer = setInterval(refreshPublicGames, PUBLIC_GAMES_REFRESH_MS)
    return () => clearInterval(timer)
  }, [mode, refreshPublicGames])

  async function handleManualRefresh() {
    setRefreshing(true)
    await refreshPublicGames()
    setRefreshing(false)
  }

  // Hot-seat practice has no "me": who starts is always random there.
  const gameRules: GameRules = opponent === 'practice' ? { ...rules, startingPlayer: 'random' } : rules

  function currentLanguage(): Language {
    return i18n.language.startsWith('de') ? 'de' : 'en'
  }

  function adoptSession(session: NetworkSession) {
    sessionStore.set(session)
    savePersisted({ role: session.playerId, roomId: session.roomId, token: session.token })
    session.onSessionExpired(() => setMode('error'))
  }

  function failWith(err: unknown) {
    setErrorKey(err instanceof SessionFailure ? errorKeyForCode(err.code) : 'serverUnreachable')
    setMode('error')
  }

  async function handleCreateGame(isPublic: boolean) {
    setInviteUrl('')
    setMode('hosting')

    try {
      const session = await createSession({ rules: gameRules, language: currentLanguage(), isPublic })
      adoptSession(session)
      setInviteUrl(session.inviteUrl ?? '')

      // Wait for the guest to actually join, not just for the server round-trip -
      // matches the "waiting for opponent" UX.
      session.onPeerConnect(() => {
        navigate('/game', { state: { role: session.playerId } })
      })
    } catch (err) {
      failWith(err)
    }
  }

  /** Leaving before anyone joined ends the session on the server, so it drops off the Open Games
   *  list and its invite link stops working. */
  function handleCancelHosting() {
    sessionStore.get()?.close()
    sessionStore.set(null)
    clearPersisted()
    setInviteUrl('')
    setMode('idle')
  }

  async function handleJoin(roomId: string) {
    setMode('joining')

    try {
      const session = await joinSession(roomId.trim())
      adoptSession(session)

      session.onStateUpdate(() => {
        navigate('/game', { state: { role: session.playerId } })
      })
    } catch (err) {
      failWith(err)
    }
  }

  /** No network session and no persistence: a hot-seat board to learn on (practice), or a game
   *  against the computer in the other seat. */
  function startLocalGame(role: Extract<ClientRole, 'practice' | 'computer'>) {
    const initialState = createInitialState({ ...gameRules, language: currentLanguage() })
    sessionStore.set(null)
    navigate('/game', { state: { role, initialGameState: initialState } })
  }

  function handleStart() {
    if (opponent === 'computer' || opponent === 'practice') startLocalGame(opponent)
    else handleCreateGame(opponent === 'public')
  }

  function waitingLabel(waitingMs: number): string {
    const minutes = Math.floor(waitingMs / 60_000)
    return minutes < 1 ? t('lobby.waitingJustNow') : t('lobby.waitingMinutes', { count: minutes })
  }

  // Phones offer their native share sheet (WhatsApp, Messages…); copying stays available.
  const canShare = typeof navigator.share === 'function'

  async function handleShare() {
    try {
      await navigator.share({ title: t('lobby.title'), text: t('lobby.shareText'), url: inviteUrl })
    } catch {
      // Dismissed, or sharing failed: the link is still there to copy.
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerTools}>
            {/* The rules overview explains the rules in general, with the rulebook values; a game's own settings are in its 📜. */}
            <HelpButton vpTarget={STANDARD_RULES.vpTarget} />
            <SettingsButton />
          </div>
          <h1 className={styles.title}>{t('lobby.title')}</h1>
          <p className={styles.tagline}>{t('lobby.tagline')}</p>
        </div>

        {mode === 'idle' && (
          <div className={styles.actions}>
            {/* Open games come first: the quickest way into a game, when there is one. When there
                is none it shrinks to a single line that still offers the manual refresh. */}
            <section className={publicGames.length ? styles.openGames : styles.openGamesEmpty}>
              <div className={styles.listHeader}>
                <h2>
                  <span aria-hidden="true">🌍 </span>
                  {listFailed ? t('lobby.listUnavailable')
                    : publicGames.length ? t('lobby.openGames') : t('lobby.noOpenGames')}
                </h2>
                <button className="secondary" onClick={handleManualRefresh} disabled={refreshing}>
                  {t('lobby.refresh')}
                </button>
              </div>
              {!listFailed && publicGames.length > 0 && (
                <ul className={styles.games}>
                  {publicGames.map(g => (
                    <li key={g.roomId} className={styles.game}>
                      <span className={styles.gameInfo}>
                        <span className={styles.gameCode}>{g.roomId}</span>
                        <span className={styles.gameMeta}>
                          {t('lobby.vpShort', { count: g.vpTarget })}
                          {g.customRules && <> · {t('rules.customShort')}</>} · {waitingLabel(g.waitingMs)}
                        </span>
                      </span>
                      <button className="primary" onClick={() => handleJoin(g.roomId)}>{t('lobby.join')}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.option}>
              <h2>{t('lobby.newGame')}</h2>
              <fieldset className={styles.tiles}>
                <legend className={styles.visuallyHidden}>{t('lobby.opponent')}</legend>
                {OPPONENTS.map(o => (
                  <label key={o.value} className={styles.tile}>
                    <input
                      className={styles.visuallyHidden}
                      type="radio"
                      name="opponent"
                      value={o.value}
                      checked={opponent === o.value}
                      onChange={() => setOpponent(o.value)}
                    />
                    <span className={styles.tileIcon} aria-hidden="true">{o.icon}</span>
                    <span className={styles.tileLabel}>{t(o.labelKey)}</span>
                  </label>
                ))}
              </fieldset>
              <p className={styles.hint}>{t(OPPONENTS.find(o => o.value === opponent)!.hintKey)}</p>

              <button className={styles.rulesRow} onClick={() => setRulesOpen(true)}>
                <span className={styles.rulesLabel}>{t('rules.open')} <span aria-hidden="true">📋</span></span>
                <span className={styles.rulesSummary}>
                  {t('lobby.vpShort', { count: rules.vpTarget })}
                  {' · '}
                  {hasCustomRules(gameRules) ? t('rules.custom') : t('rules.rulebook')}
                </span>
              </button>
              {rulesOpen && (
                <GameRulesSheet
                  rules={rules}
                  onChange={setRules}
                  showStartingPlayer={opponent !== 'practice'}
                  onClose={() => setRulesOpen(false)}
                />
              )}

              <button className="primary" onClick={handleStart}>{t('lobby.start')}</button>
            </section>

            <div className={styles.codeRow}>
              <label htmlFor="room-code">{t('lobby.haveCode')}</label>
              <input
                id="room-code"
                type="text"
                value={manualRoomId}
                onChange={e => setManualRoomId(e.target.value)}
                placeholder={t('lobby.roomCode')}
              />
              <button className="secondary" onClick={() => handleJoin(manualRoomId)} disabled={!manualRoomId.trim()}>
                {t('lobby.join')}
              </button>
            </div>
          </div>
        )}

        {mode === 'hosting' && (
          <div className="card">
            <h2>{t('lobby.waitingForGuest')}</h2>
            {opponent === 'public' && <p className={styles.hint}>{t('lobby.publicListed')}</p>}
            <div className={styles.field}>
              <label>{t('lobby.inviteLink')}</label>
              <textarea rows={3} readOnly value={inviteUrl} />
              <div className={styles.shareButtons}>
                {canShare && (
                  <button className="primary" onClick={handleShare}>{t('lobby.share')}</button>
                )}
                <button className="secondary" onClick={handleCopy}>
                  {copied ? t('lobby.linkCopied') : t('lobby.copyLink')}
                </button>
              </div>
            </div>
            <p className={styles.hint}>{t('lobby.shareLink')}</p>
            <button className="secondary" onClick={handleCancelHosting} disabled={!inviteUrl}>
              {t('lobby.cancel')}
            </button>
          </div>
        )}

        {mode === 'joining' && (
          <div className="card">
            <p>{t('lobby.connecting')}</p>
          </div>
        )}

        {mode === 'error' && (
          <div className="card">
            <p className={styles.error}>{t(`lobby.${errorKey}`)}</p>
            <button className="primary" onClick={() => setMode('idle')}>
              {t('lobby.backToLobby')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
