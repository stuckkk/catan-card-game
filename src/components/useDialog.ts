import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select, textarea, summary, [tabindex]:not([tabindex="-1"])'

/** Keyboard behaviour of a dialog, for the element the returned ref is put on (give it
 *  tabIndex={-1}): focus moves into it when it opens and back to where it was when it closes,
 *  Tab stays inside, and Escape calls `onClose` (a mandatory pick has none). */
export function useDialog<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement
    el.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && close.current) {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el!.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0], last = items[items.length - 1]
      const at = document.activeElement
      if (!first) e.preventDefault()
      else if (e.shiftKey && (at === first || at === el)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  return ref
}
