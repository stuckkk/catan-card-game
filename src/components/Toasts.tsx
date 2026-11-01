import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityLine } from './activityText'
import styles from './Toasts.module.css'

interface Props {
  toasts: ActivityLine[]
  onDismiss: (id: string) => void
  /** How long a toast stays up, in ms: [plain line, event card with its effect text]. */
  durations: [number, number]
}

/** Short-lived notices over the board for things that just happened. */
export default function Toasts({ toasts, onDismiss, durations }: Props) {
  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={onDismiss} durations={durations} />)}
    </div>
  )
}

function Toast({ toast, onDismiss, durations }: Pick<Props, 'onDismiss' | 'durations'> & { toast: ActivityLine }) {
  const { t } = useTranslation()

  // Event cards carry their effect text, so they stay up longer.
  const [plain, withDetail] = durations
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.detail ? withDetail : plain)
    return () => clearTimeout(timer)
  }, [toast.id, toast.detail, onDismiss, plain, withDetail])

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
