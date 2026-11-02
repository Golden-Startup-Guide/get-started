import { type KeyboardEvent } from 'react'

export function keepFocusInDialog(event: KeyboardEvent<HTMLElement>, onEscape?: () => void) {
  // Something inside already used this Escape, such as closing the editor's suggestions.
  if (event.key === 'Escape' && event.defaultPrevented) return
  if (event.key === 'Escape' && onEscape) {
    event.preventDefault()
    onEscape()
    return
  }
  if (event.key !== 'Tab') return
  const elements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
    ),
  )
  if (!elements.length) return
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
