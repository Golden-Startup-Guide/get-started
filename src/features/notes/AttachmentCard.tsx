import { useEffect, useState } from 'react'
import {
  Paperclip,
  Trash2,
} from 'lucide-react'
import type {
  NoteAttachment,
} from '../../types'
import { formatBytes } from './noteDisplay'
import { t } from '../../i18n/i18n'

export function AttachmentCard({
  attachment,
  onDelete,
}: {
  attachment: NoteAttachment
  onDelete: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const isImagePreviewable = ['image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']
    .includes(attachment.type.toLocaleLowerCase())
  const isAudio = attachment.type.toLocaleLowerCase().startsWith('audio/')
  const isRenderable = isImagePreviewable || isAudio

  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    // A blob URL runs with the app's origin. Opening an HTML or SVG attachment's link in a
    // new tab could then read every note, so anything not previewed here is download-only.
    const blob = isRenderable ? attachment.blob : new Blob([attachment.blob], { type: 'application/octet-stream' })
    const objectUrl = URL.createObjectURL(blob)
    // A blob URL is an external resource that must be created and revoked as a pair, which is
    // what an effect is for. Creating it during render (useMemo or a state initializer) would
    // leave a revoked URL after StrictMode's extra effect cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [attachment.blob, isRenderable])

  return (
    <li className="attachment-card">
      {url && isImagePreviewable && (
        <img className="attachment-image" src={url} alt={t("Preview of {name}", { name: attachment.name })} />
      )}
      {url && isAudio && (
        <audio className="attachment-audio" controls preload="metadata" src={url}>
          {t("Audio playback is not supported by this browser.")}
        </audio>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <Paperclip size={15} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm" title={attachment.name}>{attachment.name}</span>
        <span className="shrink-0 text-xs text-[var(--muted)]">{formatBytes(attachment.size)}</span>
        {url && <a className="secondary-button !min-h-8 !px-2 !py-1 text-xs" href={url} download={attachment.name} aria-label={t("Download {name}", { name: attachment.name })}>{t("Download")}</a>}
        <button className="icon-button !h-8 !w-8" onClick={onDelete} aria-label={t("Remove attachment {name}", { name: attachment.name })}><Trash2 size={14} /></button>
      </div>
    </li>
  )
}
