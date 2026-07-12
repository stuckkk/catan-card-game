import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createSession, joinSession, SessionFailure } from '../network/wsSession'
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

  async function handleCreateGame() {
    setMode('hosting')

    try {
      const session = await createSession({ vpTarget, language: currentLanguage() })
      sessionStore.set(session)
      setInviteUrl(session.inviteUrl ?? '')
      savePersisted({ role: session.playerId, roomId: session.roomId, token: session.token })

      // Wait for the guest to actually join, not just for the server round-trip -
      // matches the "waiting for opponent" UX.
      session.onPeerConnect(() => {
        navigate('/game', { state: { role: session.playerId } })
      })
      session.onSessionExpired(() => setMode('error'))
    } catch (err) {
      setErrorKey(err instanceof SessionFailure ? errorKeyForCode(err.code) : 'serverUnreachable')
      setMode('error')
    }
  }

  async function handleJoin(roomId: string) {
    setMode('joining')

    try {
      const session = await joinSession(roomId.trim())
      sessionStore.set(session)
      savePersisted({ role: session.playerId, roomId: session.roomId, token: session.token })

      session.onStateUpdate(() => {
        navigate('/game', { state: { role: session.playerId } })
      })
      session.onSessionExpired(() => setMode('error'))
    } catch (err) {
      setErrorKey(err instanceof SessionFailure ? errorKeyForCode(err.code) : 'serverUnreachable')
      setMode('error')
    }
  }

  function handlePractice() {
    const initialState = createInitialState({ vpTarget, language: currentLanguage() })
    sessionStore.set(null)
    // No network session and no persistence — a solo hot-seat board to learn on.
    navigate('/game', { state: { role: 'practice', initialGameState: initialState } })
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
          <h1>{t('lobby.title')}</h1>
          <div className={styles.langSwitch}>
            <button className="secondary" onClick={() => i18n.changeLanguage('en')}
              style={{ opacity: i18n.language === 'en' ? 1 : 0.5 }}>EN</button>
            <button className="secondary" onClick={() => i18n.changeLanguage('de')}
              style={{ opacity: i18n.language.startsWith('de') ? 1 : 0.5 }}>DE</button>
          </div>
        </div>

        {mode === 'idle' && (
          <div className={styles.actions}>
            <div className="card">
              <h2>{t('lobby.createGame')}</h2>
              <div className={styles.field}>
                <label>{t('lobby.vpTarget')}</label>
                <select value={vpTarget} onChange={e => setVpTarget(Number(e.target.value))}>
                  <option value={7}>7</option>
                  <option value={12}>12</option>
                  <option value={13}>13</option>
                </select>
              </div>
              <button className="primary" onClick={handleCreateGame}>{t('lobby.createGame')}</button>
            </div>

            <div className={styles.divider}>— or —</div>

            <div className="card">
              <h2>{t('lobby.joinGame')}</h2>
              <div className={styles.field}>
                <label>{t('lobby.pasteRoomCode')}</label>
                <input
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

            <button className="secondary" onClick={handlePractice}>{t('lobby.practice')}</button>
          </div>
        )}

        {mode === 'hosting' && (
          <div className="card">
            <h2>{t('lobby.waitingForGuest')}</h2>
            <div className={styles.field}>
              <label>{t('lobby.inviteLink')}</label>
              <textarea rows={3} readOnly value={inviteUrl} />
              <button className="secondary" onClick={handleCopy}>
                {copied ? t('lobby.linkCopied') : t('lobby.copyLink')}
              </button>
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
