import type { ReactNode } from 'react'
import dialog from './Dialog.module.css'

interface Props {
  /** A tap on the backdrop closes it. Without it the dialog is a mandatory pick. */
  onClose?: () => void
  children: ReactNode
}

/** A bottom sheet over a dimmed backdrop (the content uses Dialog.module.css's title, hint, actions…). */
export default function Modal({ onClose, children }: Props) {
  if (!onClose) {
    return (
      <div className={dialog.backdrop} role="dialog" aria-modal="true">
        <div className={dialog.sheet}>{children}</div>
      </div>
    )
  }
  return (
    <div className={dialog.backdrop} onClick={onClose}>
      <div className={dialog.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
