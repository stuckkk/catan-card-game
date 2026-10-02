import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityLine } from './activityText'
import styles from './Toasts.module.css'

interface Props {
  toasts: ActivityLine[]
  onDismiss: (id: string) => void
}

/** Short-lived notices over the board for things that just happened. */
export default function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  )
}

function Toast({ toast, onDismiss }: { toast: ActivityLine; onDismiss: (id: string) => void }) {
  const { t } = useTranslation()

  // Event cards carry their effect text, so they stay up longer.
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.detail ? 8000 : 4500)
    return () => clearTimeout(timer)
  }, [toast.id, toast.detail, onDismiss])

  return (
    <button className={styles.toast} onClick={() => onDismiss(toast.id)} title={t('game.log.dismiss')}>
      <span className={styles.line}>
        {toast.who && <span className={styles.who}>{toast.who}</span>}
        <span>{toast.text}</span>
      </span>
      {toast.detail && <span className={styles.detail}>{toast.detail}</span>}
    </button>
  )
}
