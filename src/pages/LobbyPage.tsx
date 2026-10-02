import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createSession, joinSession, SessionFailure } from '../network/wsSession'
import type { NetworkSession } from '../network/wsSession'
import { sessionStore } from '../network/sessionStore'
import { savePersisted } from '../network/persistence'
import { createInitialState } from '../engine/engine'
import styles from './LobbyPage.module.css'

type LobbyMode = 'idle' | 'hosting' | 'joining' | 'error'
type ErrorKey = 'connectionLost' | 'roomNotFound' | 'sessionExpired' | 'serverUnreachable'

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
  const [vpTarget, setVpTarget] = useState(12)
  const [inviteUrl, setInviteUrl] = useState('')
  const [manualRoomId, setManualRoomId] = useState('')
  const [copied, setCopied] = useState(false)
  const [errorKey, setErrorKey] = useState<ErrorKey>('connectionLost')

  // Auto-join when arriving via invite link
  useEffect(() => {
    const match = window.location.hash.match(/^#join=(.+)/)
    if (match) {
      handleJoin(match[1])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function currentLanguage(): 'en' | 'de' {
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

  async function handleCreateGame() {
    setMode('hosting')

    try {
      const session = await createSession({ vpTarget, language: currentLanguage() })
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

  function handlePractice() {
    const initialState = createInitialState({ vpTarget, language: currentLanguage() })
    sessionStore.set(null)
    // No network session and no persistence — a solo hot-seat board to learn on.
    navigate('/game', { state: { role: 'practice', initialGameState: initialState } })
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
          <div className={styles.langSwitch} role="group" aria-label={t('lobby.language')}>
            <button className={styles.lang} aria-pressed={i18n.language === 'en'} onClick={() => i18n.changeLanguage('en')}>EN</button>
            <button className={styles.lang} aria-pressed={i18n.language.startsWith('de')} onClick={() => i18n.changeLanguage('de')}>DE</button>
          </div>
          <h1 className={styles.title}>{t('lobby.title')}</h1>
          <p className={styles.tagline}>{t('lobby.tagline')}</p>
        </div>

        {mode === 'idle' && (
          <div className={styles.actions}>
            <section className={styles.option}>
              <h2>{t('lobby.createGame')}</h2>
              <div className={styles.inline}>
                <div className={styles.field}>
                  <label htmlFor="vp-target">{t('lobby.vpTarget')}</label>
                  <select id="vp-target" value={vpTarget} onChange={e => setVpTarget(Number(e.target.value))}>
                    <option value={7}>7</option>
                    <option value={12}>12</option>
                    <option value={13}>13</option>
                  </select>
                </div>
                <button className="primary" onClick={handleCreateGame}>{t('lobby.createGame')}</button>
              </div>
            </section>

            <section className={styles.option}>
              <h2>{t('lobby.joinGame')}</h2>
              <div className={styles.inline}>
                <div className={styles.field}>
                  <label htmlFor="room-code">{t('lobby.pasteRoomCode')}</label>
                  <input
                    id="room-code"
                    type="text"
                    value={manualRoomId}
                    onChange={e => setManualRoomId(e.target.value)}
                    placeholder={t('lobby.roomCode')}
                  />
                </div>
                <button className="primary" onClick={() => handleJoin(manualRoomId)} disabled={!manualRoomId.trim()}>
                  {t('lobby.connect')}
                </button>
              </div>
            </section>

            <div className={styles.divider}><span>{t('lobby.or')}</span></div>

            <button className="secondary" onClick={handlePractice}>{t('lobby.practice')}</button>
          </div>
        )}

        {mode === 'hosting' && (
          <div className="card">
            <h2>{t('lobby.waitingForGuest')}</h2>
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
