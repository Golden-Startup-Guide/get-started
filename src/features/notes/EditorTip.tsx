import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { t } from '../../i18n/i18n'

const DISMISSED_KEY = 'my-notes-editor-tip-dismissed'

const dismissedBefore = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'yes'
  } catch {
    return false
  }
}

/** A tip for new users, shown above the editor until they close it. */
export function EditorTip() {
  const [dismissed, setDismissed] = useState(dismissedBefore)
  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, 'yes')
    } catch {
      // Without storage the tip simply shows again next time.
    }
  }

  return (
    <div className="editor-tip" role="note">
      <Lightbulb size={16} aria-hidden="true" className="shrink-0" />
      <p className="min-w-0 flex-1">
        {t('Just start typing. Use the buttons above for bold, lists, and links, or type / for headings, checklists, tables, and more.')}
      </p>
      <button type="button" className="icon-button !h-7 !w-7" onClick={dismiss} aria-label={t('Dismiss tip')}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
