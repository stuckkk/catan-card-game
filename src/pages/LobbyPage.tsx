import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createHostSession, joinHostSession, decodeOfferFromUrl } from '../network/webrtc'
import type { HostSession, GuestSession } from '../network/webrtc'
import { createInitialState } from '../engine/engine'
import type { GameState } from '../engine/types'
import styles from './LobbyPage.module.css'

type LobbyMode = 'idle' | 'hosting' | 'hosting-waiting-answer' | 'joining' | 'connecting'

export default function LobbyPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [mode, setMode] = useState<LobbyMode>('idle')
  const [vpTarget, setVpTarget] = useState(12)
  const [inviteUrl, setInviteUrl] = useState('')
  const [answerInput, setAnswerInput] = useState('')
  const [offerInput, setOfferInput] = useState('')
  const [guestAnswerCode, setGuestAnswerCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const hostSessionRef = useRef<HostSession | null>(null)
  const guestSessionRef = useRef<GuestSession | null>(null)

  // Auto-detect invite link in URL on load
  useEffect(() => {
    const offer = decodeOfferFromUrl(window.location.href)
    if (offer) {
      setMode('joining')
      handleJoinFromUrl()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreateGame() {
    setMode('hosting')
    setError('')
    try {
      const session = await createHostSession()
      hostSessionRef.current = session
      setInviteUrl(session.inviteUrl)
      setMode('hosting-waiting-answer')

      session.onConnect(() => {
        // Guest connected — send initial state
        const lang = i18n.language.startsWith('de') ? 'de' : 'en'
        const initialState: GameState = createInitialState({ vpTarget, language: lang })
        session.sendState({
          ...initialState,
          players: {
            host: { ...initialState.players.host, hand: initialState.players.host.hand.length } as never,
            guest: initialState.players.guest,
          },
        })
        navigate('/game', {
          state: { role: 'host', initialGameState: initialState },
        })
      })
    } catch (e) {
      setError(String(e))
      setMode('idle')
    }
  }

  async function handleAcceptAnswer() {
    if (!hostSessionRef.current || !answerInput.trim()) return
    setError('')
    try {
      await hostSessionRef.current.acceptAnswer(answerInput.trim())
    } catch {
      setError(t('lobby.invalidCode'))
    }
  }

  async function handleJoinFromUrl() {
    setError('')
    try {
      const session = await joinHostSession(window.location.href)
      guestSessionRef.current = session
      setGuestAnswerCode(session.answerCode)
      setMode('joining')
    } catch {
      setError(t('lobby.invalidCode'))
      setMode('idle')
    }
  }

  async function handleJoinManual() {
    if (!offerInput.trim()) return
    setError('')
    setMode('connecting')
    try {
      const session = await joinHostSession(offerInput.trim())
      guestSessionRef.current = session
      setGuestAnswerCode(session.answerCode)
      setMode('joining')

      session.onStateUpdate((state) => {
        navigate('/game', {
          state: { role: 'guest', projectedState: state },
        })
      })
    } catch {
      setError(t('lobby.invalidCode'))
      setMode('idle')
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
                <label>{t('lobby.orPasteOfferCode')}</label>
                <textarea rows={4} value={offerInput} onChange={e => setOfferInput(e.target.value)}
                  placeholder={t('lobby.offerCode')} />
              </div>
              <button className="primary" onClick={handleJoinManual} disabled={!offerInput.trim()}>
                {t('lobby.connect')}
              </button>
            </div>
          </div>
        )}

        {mode === 'hosting' && (
          <div className="card"><p>{t('lobby.connecting')}</p></div>
        )}

        {mode === 'hosting-waiting-answer' && (
          <div className="card">
            <div className={styles.field}>
              <label>{t('lobby.inviteLink')}</label>
              <textarea rows={3} readOnly value={inviteUrl} />
              <button className="secondary" onClick={handleCopy}>
                {copied ? t('lobby.linkCopied') : t('lobby.copyLink')}
              </button>
            </div>
            <p className={styles.hint}>{t('lobby.waitingForGuest')}</p>
            <div className={styles.field}>
              <label>{t('lobby.pasteAnswerCode')}</label>
              <textarea rows={4} value={answerInput} onChange={e => setAnswerInput(e.target.value)}
                placeholder={t('lobby.answerCode')} />
            </div>
            <button className="primary" onClick={handleAcceptAnswer} disabled={!answerInput.trim()}>
              {t('lobby.connect')}
            </button>
          </div>
        )}

        {mode === 'joining' && guestAnswerCode && (
          <div className="card">
            <div className={styles.field}>
              <label>{t('lobby.yourAnswerCode')}</label>
              <textarea rows={6} readOnly value={guestAnswerCode} />
              <button className="secondary" onClick={async () => {
                await navigator.clipboard.writeText(guestAnswerCode)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}>
                {copied ? t('lobby.linkCopied') : t('lobby.copyLink')}
              </button>
            </div>
            <p className={styles.hint}>{t('lobby.waitingForGuest')}</p>
          </div>
        )}

        {mode === 'connecting' && (
          <div className="card"><p>{t('lobby.connecting')}</p></div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}
