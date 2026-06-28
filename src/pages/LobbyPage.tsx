import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createHostSession, joinHostSession } from '../network/trysteroSession'
import { sessionStore } from '../network/sessionStore'
import { savePersisted } from '../network/persistence'
import { createInitialState, projectForGuest } from '../engine/engine'
import styles from './LobbyPage.module.css'

type LobbyMode = 'idle' | 'hosting' | 'joining' | 'error'

export default function LobbyPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [mode, setMode] = useState<LobbyMode>('idle')
  const [vpTarget, setVpTarget] = useState(12)
  const [inviteUrl, setInviteUrl] = useState('')
  const [manualRoomId, setManualRoomId] = useState('')
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Auto-join when arriving via invite link
  useEffect(() => {
    const match = window.location.hash.match(/^#join=(.+)/)
    if (match) {
      handleJoin(match[1])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCreateGame() {
    setMode('hosting')
    setErrorMsg('')

    const session = createHostSession()
    sessionStore.setHost(session)
    sessionStore.setGuest(null)
    setInviteUrl(session.inviteUrl)
    savePersisted({ role: 'host', roomId: session.roomId })

    let started = false
    session.onConnect(() => {
      if (started) return  // ignore reconnects while still in the lobby
      started = true
      const lang = i18n.language.startsWith('de') ? 'de' : 'en'
      const initialState = createInitialState({ vpTarget, language: lang })
      session.sendState(projectForGuest(initialState))
      savePersisted({ role: 'host', roomId: session.roomId, hostState: initialState })
      navigate('/game', { state: { role: 'host', initialGameState: initialState } })
    })

    session.onDisconnect(() => setMode('error'))
  }

  function handleJoin(roomId: string) {
    setMode('joining')
    setErrorMsg('')

    const session = joinHostSession(roomId.trim())
    sessionStore.setGuest(session)
    sessionStore.setHost(null)
    savePersisted({ role: 'guest', roomId: session.roomId })

    let entered = false
    session.onStateUpdate(projectedState => {
      savePersisted({ role: 'guest', roomId: session.roomId, guestProjected: projectedState })
      if (entered) return  // GamePage takes over state updates once mounted
      entered = true
      navigate('/game', { state: { role: 'guest', projectedState } })
    })
  }

  function handlePractice() {
    const lang = i18n.language.startsWith('de') ? 'de' : 'en'
    const initialState = createInitialState({ vpTarget, language: lang })
    sessionStore.setHost(null)
    sessionStore.setGuest(null)
    // No network session and no persistence — a solo hot-seat board to learn on.
    navigate('/game', { state: { role: 'host', initialGameState: initialState } })
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
            <p className={styles.error}>{t('lobby.connectionLost')}</p>
            <button className="primary" onClick={() => { setMode('idle'); setErrorMsg('') }}>
              {t('lobby.backToLobby')}
            </button>
          </div>
        )}

        {errorMsg && <p className={styles.error}>{errorMsg}</p>}
      </div>
    </div>
  )
}
