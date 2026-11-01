import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  Check,
  Clock3,
  Heart,
  Link2,
  Mic,
  Paperclip,
  Pin,
  Square,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react'
import {
  addNoteAttachment,
  deleteNoteAttachment,
  getNoteHistory,
  getNoteLinks,
  getNoteAttachments,
  linkNotes,
  restoreHistory,
  unlinkNotes,
} from '../../lib/notes'
import type {
  Note,
  NoteAttachment,
  Notebook,
  NoteHistoryEntry,
  NoteLink,
  Tag,
} from '../../types'
import { formatDate, getNoteLinkLabel } from './noteDisplay'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { AttachmentCard } from './AttachmentCard'
import { useDebouncedAutosave } from './useDebouncedAutosave'
import { getChecklistProgress, toggleChecklistItem } from './checklists'
import { MarkdownPreview } from './MarkdownPreview'
import { MAX_ATTACHMENT_SIZE_BYTES } from './attachments'

type SaveState = 'saved' | 'unsaved' | 'saving'

export function NoteEditor({
  note,
  isCreating,
  notebooks,
  tags,
  notes,
  trash,
  onSave,
  onRefresh,
  onClose,
  onOpenNote,
  onDelete,
  onError,
  changedElsewhere,
  onLoadLatest,
  onKeepMine,
}: {
  note: Note
  isCreating: boolean
  notebooks: Notebook[]
  tags: Tag[]
  notes: Note[]
  trash: Note[]
  onSave: (note: Note) => Promise<void>
  onRefresh: () => Promise<void>
  onClose: () => void
  onOpenNote: (note: Note) => void
  onDelete: () => Promise<boolean>
  onError: (message: string | null) => void
  changedElsewhere: boolean
  onLoadLatest: () => void
  onKeepMine: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [noteTags, setNoteTags] = useState(note.tags ?? [])
  // The select can only show existing notebooks, so never keep an ID it cannot display.
  const initialNotebookId = notebooks.some((notebook) => notebook.id === note.notebookId)
    ? note.notebookId ?? ''
    : notebooks[0]?.id ?? ''
  const [notebookId, setNotebookId] = useState(initialNotebookId)
  const [pinned, setPinned] = useState(Boolean(note.pinned))
  const [favorite, setFavorite] = useState(Boolean(note.favorite))
  const [tagInput, setTagInput] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [previewOnly, setPreviewOnly] = useState(false)
  const [history, setHistory] = useState<NoteHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [links, setLinks] = useState<{ outgoing: NoteLink[]; backlinks: NoteLink[] }>({ outgoing: [], backlinks: [] })
  const [linkTargetId, setLinkTargetId] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(!isCreating)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isAddingAttachment, setIsAddingAttachment] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const attachmentFileRef = useRef<HTMLInputElement>(null)
  const recordingRef = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    chunks: Blob[]
    exceeded: boolean
  } | null>(null)
  const latest = useRef({ title, content, noteTags, notebookId, pinned, favorite })
  const baseline = useRef({ title: note.title, content: note.content, tags: note.tags ?? [], notebookId: initialNotebookId, pinned: Boolean(note.pinned), favorite: Boolean(note.favorite) })
  const saveRef = useRef<() => Promise<boolean>>(async () => false)

  latest.current = { title, content, noteTags, notebookId, pinned, favorite }
  saveRef.current = async () => {
    const draft = latest.current
    if (isCreating && !draft.title.trim() && !draft.content.trim()) return true
    const old = baseline.current
    const changed = draft.title !== old.title || draft.content !== old.content ||
      JSON.stringify(draft.noteTags) !== JSON.stringify(old.tags) ||
      draft.notebookId !== old.notebookId || draft.pinned !== old.pinned || draft.favorite !== old.favorite
    if (!changed) return true
    setSaveState('saving')
    setSaveError(null)
    const next: Note = {
      ...note,
      title: draft.title.trim() || 'Untitled note',
      content: draft.content,
      tags: draft.noteTags,
      notebookId: draft.notebookId,
      pinned: draft.pinned,
      favorite: draft.favorite,
      updatedAt: Date.now(),
    }
    try {
      await onSave(next)
      setPersisted(true)
      baseline.current = { title: draft.title, content: draft.content, tags: draft.noteTags, notebookId: draft.notebookId, pinned: draft.pinned, favorite: draft.favorite }
      setSaveState('saved')
      return true
    } catch {
      setSaveState('unsaved')
      setSaveError('Could not save. Your changes are still here; try again.')
      return false
    }
  }

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true
    getNoteAttachments(note.id)
      .then((saved) => {
        if (active) setAttachments(saved)
      })
      .catch(() => {
        if (active) setAttachmentError('Attachments could not be loaded.')
      })
    return () => {
      active = false
      const recording = recordingRef.current
      if (recording) {
        recording.recorder.onstop = null
        if (recording.recorder.state !== 'inactive') recording.recorder.stop()
        recording.stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [note.id])

  useEffect(() => {
    let active = true
    getNoteLinks(note.id)
      .then((saved) => {
        if (active) setLinks(saved)
      })
      .catch(() => {
        if (active) setLinkError('Note links could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [note.id])

  const dirty = title !== baseline.current.title || content !== baseline.current.content ||
    JSON.stringify(noteTags) !== JSON.stringify(baseline.current.tags) ||
    notebookId !== baseline.current.notebookId || pinned !== baseline.current.pinned || favorite !== baseline.current.favorite
  const draftKey = JSON.stringify([title, content, noteTags, notebookId, pinned, favorite])
  const { flush, cancel, skipUnmountSave, resumeUnmountSave } = useDebouncedAutosave(
    dirty,
    draftKey,
    () => saveRef.current(),
    undefined,
    changedElsewhere,
  )

  async function addAttachment(file: File) {
    setAttachmentError(null)
    if (isCreating && !latest.current.title.trim() && !latest.current.content.trim()) {
      setAttachmentError('Add a title or note text before attaching files.')
      return
    }
    if (!(await flush())) {
      setAttachmentError('Save this note before adding attachments.')
      return
    }
    setIsAddingAttachment(true)
    try {
      const added = await addNoteAttachment(note.id, file, file.name)
      setAttachments((current) => [...current, added])
      await onRefresh()
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : 'The attachment could not be saved.')
    } finally {
      setIsAddingAttachment(false)
    }
  }

  function handleAttachmentFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    for (const file of files) void addAttachment(file)
  }

  async function toggleAudioRecording() {
    const current = recordingRef.current
    if (current) {
      if (current.recorder.state !== 'inactive') current.recorder.stop()
      return
    }
    setAttachmentError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAttachmentError('Audio recording is not supported by this browser. You can attach an audio file instead.')
      return
    }
    if (isCreating && !latest.current.title.trim() && !latest.current.content.trim()) {
      setAttachmentError('Add a title or note text before recording audio.')
      return
    }
    if (!(await flush())) {
      setAttachmentError('Save this note before recording audio.')
      return
    }
    let stream: MediaStream | undefined
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream = activeStream
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream)
      const recording = { recorder, stream, chunks: [] as Blob[], exceeded: false }
      recordingRef.current = recording
      recorder.ondataavailable = (event) => {
        if (event.data.size) recording.chunks.push(event.data)
        const total = recording.chunks.reduce((sum, chunk) => sum + chunk.size, 0)
        if (total > MAX_ATTACHMENT_SIZE_BYTES) {
          recording.exceeded = true
          setAttachmentError('The recording reached the 5 MiB limit and was discarded.')
          if (recorder.state !== 'inactive') recorder.stop()
        }
      }
      recorder.onerror = () => {
        recording.exceeded = true
        setAttachmentError('Audio recording failed. Check microphone permissions and try again.')
        if (recorder.state !== 'inactive') recorder.stop()
      }
      recorder.onstop = () => {
        activeStream.getTracks().forEach((track) => track.stop())
        recordingRef.current = null
        setIsRecording(false)
        if (recording.exceeded) return
        const blob = new Blob(recording.chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) return
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `audio-note-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, { type: blob.type })
        void addAttachment(file)
      }
      recorder.start(250)
      setIsRecording(true)
    } catch (reason) {
      recordingRef.current = null
      setIsRecording(false)
      stream?.getTracks().forEach((track) => track.stop())
      setAttachmentError(reason instanceof Error ? reason.message : 'Microphone access was denied or unavailable.')
    }
  }

  async function removeAttachment(attachment: NoteAttachment) {
    if (!window.confirm(`Remove “${attachment.name}” from this note?`)) return
    try {
      await deleteNoteAttachment(attachment.id)
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
      await onRefresh()
      setAttachmentError(null)
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : 'The attachment could not be removed.')
    }
  }

  useEffect(() => {
    if (dirty) setSaveState('unsaved')
  }, [dirty])

  // Discards this tab's draft, so the stale copy is never saved over the newer one.
  const loadLatest = useCallback(() => {
    cancel()
    skipUnmountSave()
    onLoadLatest()
  }, [cancel, onLoadLatest, skipUnmountSave])

  // With nothing unsaved here, show the other tab's changes right away.
  useEffect(() => {
    if (changedElsewhere && !dirty && saveState === 'saved') loadLatest()
  }, [changedElsewhere, dirty, loadLatest, saveState])

  async function closeSafely() {
    const saved = await flush()
    if (saved) onClose()
  }

  async function addLink() {
    if (!linkTargetId || !(await flush())) return
    try {
      if (!notes.some((item) => item.id === note.id)) {
        setLinkError('Save this note and restore it from Trash before adding links.')
        return
      }
      await linkNotes(note.id, linkTargetId)
      setLinks(await getNoteLinks(note.id))
      setLinkTargetId('')
      setLinkError(null)
    } catch (reason) {
      setLinkError(reason instanceof Error ? reason.message : 'The note could not be linked.')
    }
  }

  async function removeLink(targetNoteId: string) {
    if (!(await flush())) return
    try {
      await unlinkNotes(note.id, targetNoteId)
      setLinks(await getNoteLinks(note.id))
      setLinkError(null)
    } catch (reason) {
      setLinkError(reason instanceof Error ? reason.message : 'The link could not be removed.')
    }
  }

  async function openRelatedNote(related: Note) {
    if (related.deletedAt !== undefined || !(await flush())) return
    onOpenNote(related)
  }

  async function deleteSafely() {
    const message = note.deletedAt === undefined
      ? `Move “${title.trim() || 'Untitled note'}” to Trash? You can restore it later.`
      : `Permanently delete “${title.trim() || 'Untitled note'}”? This cannot be undone.`
    if (!window.confirm(message)) return
    if (note.deletedAt === undefined) {
      if (!(await flush())) return
    } else {
      cancel()
    }
    skipUnmountSave()
    if (!(await onDelete())) {
      resumeUnmountSave()
      void flush()
    }
  }

  function addTag(value = tagInput) {
    const cleaned = value.trim().replace(/,$/, '')
    if (!cleaned || noteTags.some((tag) => tag.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
      setTagInput('')
      return
    }
    setNoteTags((current) => [...current, cleaned])
    setTagInput('')
  }

  function tagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag()
    } else if (event.key === 'Backspace' && !tagInput && noteTags.length) {
      setNoteTags((current) => current.slice(0, -1))
    }
  }

  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false)
      return
    }
    try {
      setHistory(await getNoteHistory(note.id))
      setShowHistory(true)
    } catch {
      onError('Note history could not be loaded.')
    }
  }

  async function restore(revision: NoteHistoryEntry) {
    if (!window.confirm('Restore this saved version? Your current note will remain available in history.')) return
    // Save the draft first so the restore records it as a revision instead of discarding it.
    if (!(await flush())) return
    try {
      const restored = await restoreHistory(revision.id)
      baseline.current = { ...baseline.current, title: restored.title, content: restored.content }
      setTitle(restored.title)
      setContent(restored.content)
      await onRefresh()
      setHistory(await getNoteHistory(note.id))
      setSaveState('saved')
      setShowHistory(false)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'The revision could not be restored.')
    }
  }

  const suggestions = tags.filter((tag) =>
    tag.label.toLocaleLowerCase().includes(tagInput.trim().toLocaleLowerCase()) &&
    !noteTags.some((item) => item.toLocaleLowerCase() === tag.id),
  )
  const checklistProgress = getChecklistProgress(content)
  const allNotes = [...notes, ...trash]
  const outgoingNotes = links.outgoing
    .map((link) => allNotes.find((item) => item.id === link.targetNoteId))
    .filter((item): item is Note => Boolean(item))
  const backlinkNotes = links.backlinks
    .map((link) => allNotes.find((item) => item.id === link.sourceNoteId))
    .filter((item): item is Note => Boolean(item))
  const linkedIds = new Set(links.outgoing.map((link) => link.targetNoteId))
  const availableTargets = notes.filter((item) => item.id !== note.id && !linkedIds.has(item.id))
  const canEditLinks = persisted && note.deletedAt === undefined
  const audioRecordingSupported =
    typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  function toggleTask(lineNumber: number) {
    setContent((current) => toggleChecklistItem(current, lineNumber))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) void closeSafely()
    }}>
      <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-heading" onKeyDown={(event) => keepFocusInDialog(event, () => void closeSafely())}>
        <header className="editor-header">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-button" onClick={() => void closeSafely()} aria-label="Close editor"><ArrowLeft size={18} /></button>
            <div className="min-w-0">
              <p className="section-label">Note editor</p>
              <h2 id="editor-heading" className="truncate text-sm font-semibold">{isCreating ? 'New note' : note.title || 'Untitled note'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="save-status" role="status" aria-live="polite">
              {saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved changes' : <><Check size={14} /> Saved</>}
            </span>
            <button className={`icon-button ${pinned ? 'is-selected' : ''}`} onClick={() => setPinned((value) => !value)} aria-label={pinned ? 'Unpin note' : 'Pin note'} aria-pressed={pinned}><Pin size={17} /></button>
            <button className={`icon-button ${favorite ? 'is-favorite' : ''}`} onClick={() => setFavorite((value) => !value)} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /></button>
            <button className="icon-button" onClick={() => void toggleHistory()} aria-label="Show note history"><Clock3 size={17} /></button>
            <button className="icon-button" onClick={() => void closeSafely()} aria-label="Close editor"><X size={17} /></button>
          </div>
        </header>
        <div className="editor-toolbar">
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]" htmlFor="note-notebook">Notebook</label>
          <select id="note-notebook" className="small-input max-w-48" value={notebookId} onChange={(event) => {
            setNotebookId(event.target.value)
          }}>
            {notebooks.map((notebook) => <option value={notebook.id} key={notebook.id}>{notebook.name}</option>)}
          </select>
          <button className="secondary-button ml-auto" onClick={() => setPreviewOnly((value) => !value)} aria-pressed={previewOnly}>{previewOnly ? 'Edit Markdown' : 'Preview only'}</button>
        </div>
        <div className="editor-body">
          <div className="editor-fields">
            {changedElsewhere && (dirty || saveState !== 'saved') && (
              <div role="alert" className="notice notice-error flex-wrap">
                <span>This note was changed in another tab. Autosave is paused so neither version is lost.</span>
                <span className="flex flex-wrap gap-2">
                  <button className="secondary-button" onClick={onKeepMine}>Keep my version</button>
                  <button className="secondary-button" onClick={loadLatest}>Load the other version</button>
                </span>
              </div>
            )}
            <label htmlFor="note-title" className="sr-only">Note title</label>
            <input ref={titleRef} id="note-title" className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled note" />
            <div className="tag-editor">
              <TagIcon size={15} aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-1.5">
                {noteTags.map((tag) => (
                  <span className="tag-chip" key={tag}>{tag}<button onClick={() => setNoteTags((current) => current.filter((item) => item !== tag))} aria-label={`Remove tag ${tag}`}><X size={12} /></button></span>
                ))}
                <label className="sr-only" htmlFor="tag-input">Add tags</label>
                <input id="tag-input" className="tag-input" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={tagKeyDown} onBlur={() => tagInput.trim() && addTag()} placeholder="Add a tag…" />
              </div>
              {tagInput && suggestions.length > 0 && <div className="suggestion-list" role="listbox" aria-label="Tag suggestions">{suggestions.map((tag) => <button key={tag.id} role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag.label)}>{tag.label}</button>)}</div>}
            </div>
            <section className="note-links" aria-labelledby="note-links-heading">
              <h3 id="note-links-heading" className="mb-2 flex items-center gap-2 text-sm font-semibold"><Link2 size={15} aria-hidden="true" /> Linked notes</h3>
              {canEditLinks && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="link-note-target">Choose a note to link</label>
                  <select
                    id="link-note-target"
                    className="small-input min-w-0 flex-1"
                    value={linkTargetId}
                    onChange={(event) => setLinkTargetId(event.target.value)}
                    disabled={!availableTargets.length}
                  >
                    <option value="">Choose a note…</option>
                    {availableTargets.map((item) => (
                      <option key={item.id} value={item.id}>{getNoteLinkLabel(item, allNotes, notebooks)}</option>
                    ))}
                  </select>
                  <button className="secondary-button" onClick={() => void addLink()} disabled={!linkTargetId}>Add link</button>
                </div>
              )}
              {linkError && <p className="mb-2 text-sm text-red-700" role="alert">{linkError}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-medium text-[var(--muted)]">Links from this note</h4>
                  {outgoingNotes.length ? (
                    <ul className="note-link-list" aria-label="Links from this note">
                      {outgoingNotes.map((related) => (
                        <li key={related.id}>
                          {related.deletedAt === undefined ? (
                            <>
                              <button className="note-link-open" onClick={() => void openRelatedNote(related)}>{getNoteLinkLabel(related, allNotes, notebooks)}</button>
                              {canEditLinks && <button className="note-link-remove" onClick={() => void removeLink(related.id)} aria-label={`Remove link to ${getNoteLinkLabel(related, allNotes, notebooks)}`}>Remove</button>}
                            </>
                          ) : <span>{getNoteLinkLabel(related, allNotes, notebooks)} <span className="text-[var(--muted)]">(in Trash; link retained)</span></span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-[var(--muted)]">No linked notes yet.</p>}
                </div>
                <div>
                  <h4 className="text-xs font-medium text-[var(--muted)]">Backlinks</h4>
                  {backlinkNotes.length ? (
                    <ul className="note-link-list" aria-label="Backlinks">
                      {backlinkNotes.map((related) => (
                        <li key={related.id}>
                          {related.deletedAt === undefined ? (
                            <button className="note-link-open" onClick={() => void openRelatedNote(related)}>{getNoteLinkLabel(related, allNotes, notebooks)}</button>
                          ) : <span>{getNoteLinkLabel(related, allNotes, notebooks)} <span className="text-[var(--muted)]">(in Trash; link retained)</span></span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-[var(--muted)]">No backlinks yet.</p>}
                </div>
              </div>
              {!canEditLinks && !note.deletedAt && <p className="mt-2 text-xs text-[var(--muted)]">Save this note before linking it.</p>}
              {note.deletedAt !== undefined && <p className="mt-2 text-xs text-[var(--muted)]">Links are preserved while this note is in Trash.</p>}
            </section>
            <div className={`markdown-workspace ${previewOnly ? 'markdown-workspace-preview' : ''}`}>
              {!previewOnly && <div className="markdown-editor-pane">
                <label htmlFor="note-content" className="section-label mb-2 block">Markdown</label>
                <textarea id="note-content" className="content-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder={'Write in Markdown…\n\n# A heading\n- [ ] A checklist item'} />
              </div>}
              <article className="markdown-preview-pane" aria-label="Live Markdown preview">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="section-label">Live preview</p>
                  {checklistProgress.total > 0 && <span className="checklist-progress" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={checklistProgress.total} aria-valuenow={checklistProgress.completed}>
                    {checklistProgress.completed} of {checklistProgress.total} complete
                  </span>}
                </div>
                <div className="prose-notes">
                  <MarkdownPreview markdown={content} onToggleTask={toggleTask} />
                </div>
              </article>
            </div>
            <section className="attachments-section" aria-labelledby="attachments-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="attachments-heading" className="text-sm font-semibold">Attachments</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">Stored on this device. Each file is limited to 5 MiB; 20 MiB per note.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={attachmentFileRef}
                    id="note-attachments"
                    type="file"
                    multiple
                    className="sr-only"
                    aria-label="Choose files to attach"
                    onChange={handleAttachmentFiles}
                  />
                  <button className="secondary-button" disabled={isAddingAttachment} onClick={() => attachmentFileRef.current?.click()}>
                    <Paperclip size={15} /> Attach files
                  </button>
                  <button
                    className="secondary-button"
                    disabled={isAddingAttachment || isRecording || !audioRecordingSupported}
                    onClick={() => void toggleAudioRecording()}
                    aria-pressed={isRecording}
                  >
                    {isRecording ? <Square size={15} /> : <Mic size={15} />}
                    {isRecording ? 'Stop recording' : 'Record audio'}
                  </button>
                </div>
              </div>
              {!audioRecordingSupported && <p className="mb-2 text-xs text-[var(--muted)]">Audio recording is unavailable here; attach an audio file to play it in the note.</p>}
              {isRecording && <p className="mb-2 text-sm text-[var(--muted)]" role="status">Recording audio…</p>}
              {isAddingAttachment && <p className="mb-2 text-sm text-[var(--muted)]" role="status">Saving attachment…</p>}
              {attachmentError && <p className="mb-2 text-sm text-red-700" role="alert">{attachmentError}</p>}
              {attachments.length ? (
                <ul className="attachment-list" aria-label="Note attachments">
                  {attachments.map((attachment) => (
                    <AttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                      onDelete={() => void removeAttachment(attachment)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--muted)]">No attachments yet.</p>
              )}
            </section>
            {saveError && <p className="text-sm text-red-700" role="alert">{saveError}<button className="ml-2 underline" onClick={() => void saveRef.current()}>Retry</button></p>}
            <p className="text-xs text-[var(--muted)]">Markdown is saved locally on this device. Raw HTML is not rendered.</p>
          </div>
          {showHistory && <aside className="history-panel" aria-label="Note history">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">History</h3><button className="icon-button !h-8 !w-8" onClick={() => setShowHistory(false)} aria-label="Close history"><X size={15} /></button></div>
            {history.length ? history.map((entry) => <div className="history-item" key={entry.id}><time className="text-xs text-[var(--muted)]">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(entry.savedAt)}</time><p className="mt-1 truncate text-sm font-medium">{entry.snapshot.title || 'Untitled note'}</p><p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{entry.snapshot.content}</p><button className="secondary-button mt-2" onClick={() => void restore(entry)}>Restore</button></div>) : <p className="text-sm text-[var(--muted)]">Earlier saved versions will appear here after you edit this note.</p>}
          </aside>}
        </div>
        <footer className="editor-footer">
          <p className="text-xs text-[var(--muted)]">Created {formatDate(note.createdAt)}</p>
          {!isCreating && <button className="danger-button" onClick={() => void deleteSafely()}><Trash2 size={15} /> {note.deletedAt === undefined ? 'Move to Trash' : 'Delete forever'}</button>}
          <button className="primary-button ml-auto" onClick={() => void closeSafely()}>{saveState === 'unsaved' ? 'Save and close' : 'Done'}</button>
        </footer>
      </section>
    </div>
  )
}
