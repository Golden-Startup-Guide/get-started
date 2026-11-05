import { useId, useState, type KeyboardEvent } from 'react'
import { Zap } from 'lucide-react'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { t } from '../../i18n/i18n'

/**
 * A small box for jotting a note without leaving the current page. The text is saved to the Inbox
 * notebook; closing without saving keeps it (in `draft`) for the next time the box opens.
 */
export function QuickCapture({
  draft,
  onDraftChange,
  onSave,
  onClose,
  shortcut,
  saveShortcut,
}: {
  draft: string
  onDraftChange: (text: string) => void
  /** Resolves to whether the note was saved; on failure the text stays. */
  onSave: (text: string) => Promise<boolean>
  onClose: () => void
  /** The keyboard shortcut that opens this box, shown as a hint. */
  shortcut: string
  /** How to save from the keyboard, shown as a hint (Ctrl Enter, or ⌘ Enter on a Mac). */
  saveShortcut: string
}) {
  const [saving, setSaving] = useState(false)
  const headingId = useId()
  const hintId = useId()

  async function save() {
    if (!draft.trim() || saving) return
    setSaving(true)
    const saved = await onSave(draft)
    setSaving(false)
    if (saved) {
      onDraftChange('')
      onClose()
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void save()
    }
  }

  return (
    <div className="modal-backdrop palette-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="quick-capture"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={(event) => keepFocusInDialog(event, onClose)}
      >
        <h2 id={headingId} className="quick-capture-heading"><Zap size={16} aria-hidden="true" /> {t("Quick note")}</h2>
        <textarea
          // Opened to be typed into straight away.
          autoFocus
          className="quick-capture-input"
          aria-labelledby={headingId}
          aria-describedby={hintId}
          placeholder={t("What’s on your mind? The first line becomes the title.")}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={6}
        />
        <div className="quick-capture-footer">
          <p id={hintId} className="quick-capture-hint">
            {t("Saved to Inbox.")} <kbd className="palette-kbd">{saveShortcut}</kbd> {t("saves,")} <kbd className="palette-kbd">{t("Esc")}</kbd> {t("keeps it for later.")} {shortcut} {t("opens this box.")}
          </p>
          <div className="flex gap-2">
            {draft && <button type="button" className="secondary-button" onClick={() => onDraftChange('')}>{t("Clear")}</button>}
            <button type="button" className="primary-button" disabled={!draft.trim() || saving} onClick={() => void save()}>
              {saving ? t("Saving…") : t("Save")}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
