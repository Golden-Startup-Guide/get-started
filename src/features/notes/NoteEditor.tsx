import { isCoreId } from '../../lib/core'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
import { formatDate } from './noteDisplay'
import { NoteLinkPicker } from './NoteLinkPicker'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { AttachmentCard } from './AttachmentCard'
import { useDebouncedAutosave } from './useDebouncedAutosave'
import { getChecklistProgress, toggleChecklistItem } from './checklists'
import { MarkdownEditor } from './MarkdownEditor'
import { EditorTip } from './EditorTip'
import { changeEditorMode, updateLinksAfterRename } from '../../state/actions'
import { useEditorStore } from '../../state/editorStore'
import { useLibraryStore } from '../../state/libraryStore'
import { MarkdownPreview, type EmbeddedNote, type WikilinkTarget } from './MarkdownPreview'
import { findHeading, headingSlug, listHeadings } from '../../lib/headings'
import { buildTitleIndex, findWikilinkTargets, normalizeTitle, notesLinkingTo, targetTitle } from '../../lib/wikilinks'
import { toLinkTitles, type LinkTitle } from './wikilinkCompletion'
import { usePreviewSource } from './usePreviewSource'
import { useMarkdownTree } from './useMarkdownTree'
import { MAX_ATTACHMENT_SIZE_BYTES } from './attachments'
import { t, tp } from '../../i18n/i18n'

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
  linkLabels,
  textLinks,
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
  /** Labels for every note (see buildNoteLinkLabels), built once per library change by App. */
  linkLabels: Map<string, string>
  /** Links made by [[wikilinks]] in saved notes, across the library (see deriveWikilinks). */
  textLinks: NoteLink[]
}) {
  const editorMode = useLibraryStore((state) => state.settings.editorMode ?? 'live')
  const [title, setTitle] = useState(note.title)
  // The title other notes' [[links]] were written for. After a rename, offering to update those
  // links waits for a pause in typing the title, and is never done automatically: autosave
  // saves every few keystrokes, and intermediate titles could match other notes.
  const [linkedTitle, setLinkedTitle] = useState(isCreating ? '' : note.title.trim())
  const [updatingLinks, setUpdatingLinks] = useState(false)
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
  const [isSaving, setIsSaving] = useState(false)
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
  // The last saved version. State drives the "Unsaved changes" status during render; the ref
  // lets a queued save compare against the newest value before React has re-rendered.
  const [baseline, setBaselineState] = useState(() => ({ title: note.title, content: note.content, tags: note.tags ?? [], notebookId: initialNotebookId, pinned: Boolean(note.pinned), favorite: Boolean(note.favorite) }))
  const baselineRef = useRef(baseline)
  const saveRef = useRef<() => Promise<boolean>>(async () => false)

  function setBaseline(next: typeof baseline) {
    baselineRef.current = next
    setBaselineState(next)
  }

  // Autosave and event handlers reach the newest draft and save function through refs, which
  // are updated once each render commits (never during render itself).
  useLayoutEffect(() => {
    latest.current = { title, content, noteTags, notebookId, pinned, favorite }
    saveRef.current = async () => {
      const draft = latest.current
      if (isCreating && !draft.title.trim() && !draft.content.trim()) return true
      const old = baselineRef.current
      const changed = draft.title !== old.title || draft.content !== old.content ||
        JSON.stringify(draft.noteTags) !== JSON.stringify(old.tags) ||
        draft.notebookId !== old.notebookId || draft.pinned !== old.pinned || draft.favorite !== old.favorite
      if (!changed) return true
      setIsSaving(true)
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
        setBaseline({ title: draft.title, content: draft.content, tags: draft.noteTags, notebookId: draft.notebookId, pinned: draft.pinned, favorite: draft.favorite })
        return true
      } catch {
        setSaveError(t('Could not save. Your changes are still here; try again.'))
        return false
      } finally {
        setIsSaving(false)
      }
    }
  })

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
        if (active) setAttachmentError(t("Attachments could not be loaded."))
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
        if (active) setLinkError(t('Note links could not be loaded.'))
      })
    return () => {
      active = false
    }
  }, [note.id])

  const dirty = title !== baseline.title || content !== baseline.content ||
    JSON.stringify(noteTags) !== JSON.stringify(baseline.tags) ||
    notebookId !== baseline.notebookId || pinned !== baseline.pinned || favorite !== baseline.favorite
  const saveState: SaveState = isSaving ? 'saving' : dirty ? 'unsaved' : 'saved'
  // A new object whenever any draft field changes. Autosave compares it by identity, which is
  // free; serialising the draft for that cost several milliseconds per keystroke in a 1 MB note.
  const draftKey = useMemo(() => ({ title, content, noteTags, notebookId, pinned, favorite }), [title, content, noteTags, notebookId, pinned, favorite])
  const { flush, cancel, skipUnmountSave, resumeUnmountSave } = useDebouncedAutosave(
    dirty,
    draftKey,
    () => saveRef.current(),
    undefined,
    changedElsewhere,
  )

  // Lets the command palette save this note before it switches to something else.
  useLayoutEffect(() => {
    useEditorStore.getState().setFlush(flush)
    return () => useEditorStore.getState().setFlush(null)
  }, [flush])

  async function addAttachment(file: File) {
    setAttachmentError(null)
    if (isCreating && !latest.current.title.trim() && !latest.current.content.trim()) {
      setAttachmentError(t("Add a title or note text before attaching files."))
      return
    }
    if (!(await flush())) {
      setAttachmentError(t("Save this note before adding attachments."))
      return
    }
    setIsAddingAttachment(true)
    try {
      const added = await addNoteAttachment(note.id, file, file.name)
      setAttachments((current) => [...current, added])
      await onRefresh()
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : t('The attachment could not be saved.'))
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
      setAttachmentError(t("Audio recording is not supported by this browser. You can attach an audio file instead."))
      return
    }
    if (isCreating && !latest.current.title.trim() && !latest.current.content.trim()) {
      setAttachmentError(t("Add a title or note text before recording audio."))
      return
    }
    if (!(await flush())) {
      setAttachmentError(t("Save this note before recording audio."))
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
          setAttachmentError(t("The recording reached the 5 MiB limit and was discarded."))
          if (recorder.state !== 'inactive') recorder.stop()
        }
      }
      recorder.onerror = () => {
        recording.exceeded = true
        setAttachmentError(t("Audio recording failed. Check microphone permissions and try again."))
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
      setAttachmentError(reason instanceof Error ? reason.message : t('Microphone access was denied or unavailable.'))
    }
  }

  async function removeAttachment(attachment: NoteAttachment) {
    if (!window.confirm(t("Remove “{name}” from this note?", { name: attachment.name }))) return
    try {
      await deleteNoteAttachment(attachment.id)
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
      await onRefresh()
      setAttachmentError(null)
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : t('The attachment could not be removed.'))
    }
  }

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
        setLinkError(t('Save this note and restore it from Trash before adding links.'))
        return
      }
      await linkNotes(note.id, linkTargetId)
      setLinks(await getNoteLinks(note.id))
      setLinkTargetId('')
      setLinkError(null)
    } catch (reason) {
      setLinkError(reason instanceof Error ? reason.message : t('The note could not be linked.'))
    }
  }

  async function removeLink(targetNoteId: string) {
    if (!(await flush())) return
    try {
      await unlinkNotes(note.id, targetNoteId)
      setLinks(await getNoteLinks(note.id))
      setLinkError(null)
    } catch (reason) {
      setLinkError(reason instanceof Error ? reason.message : t('The link could not be removed.'))
    }
  }

  async function openRelatedNote(related: Note) {
    if (related.deletedAt !== undefined || !(await flush())) return
    onOpenNote(related)
  }
  const openRelatedNoteRef = useRef(openRelatedNote)
  useLayoutEffect(() => {
    openRelatedNoteRef.current = openRelatedNote
  })

  async function deleteSafely() {
    const message = note.deletedAt === undefined
      ? t('Move “{title}” to Trash? You can restore it later.', { title: title.trim() || t('Untitled note') })
      : t('Permanently delete “{title}”? This cannot be undone.', { title: title.trim() || t('Untitled note') })
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
      onError(t('Note history could not be loaded.'))
    }
  }

  async function restore(revision: NoteHistoryEntry) {
    if (!window.confirm(t("Restore this saved version? Your current note will remain available in history."))) return
    // Save the draft first so the restore records it as a revision instead of discarding it.
    if (!(await flush())) return
    try {
      const restored = await restoreHistory(revision.id)
      setBaseline({ ...baselineRef.current, title: restored.title, content: restored.content })
      setTitle(restored.title)
      setContent(restored.content)
      await onRefresh()
      setHistory(await getNoteHistory(note.id))
      setShowHistory(false)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : t('The revision could not be restored.'))
    }
  }

  const suggestions = tags.filter((tag) =>
    tag.label.toLocaleLowerCase().includes(tagInput.trim().toLocaleLowerCase()) &&
    !noteTags.some((item) => item.toLocaleLowerCase() === tag.id),
  )
  const preview = usePreviewSource(content)
  // Long notes are parsed in a worker; their preview shows the last parsed version meanwhile.
  const parsedPreview = useMarkdownTree(preview.source, preview.delayed)
  const shownSource = preview.delayed ? parsedPreview?.source : preview.source
  const previewStale = shownSource !== content
  const checklistProgress = useMemo(() => getChecklistProgress(preview.source), [preview.source])
  // Everything below depends only on the library and this note's links, not on the draft, so
  // typing never recomputes it.
  const noteById = useMemo(() => new Map([...notes, ...trash].map((item) => [item.id, item])), [notes, trash])
  const labelOf = (item: Note) => linkLabels.get(item.id) ?? (item.title || t('Untitled note'))
  const titleIndex = useMemo(() => buildTitleIndex(notes), [notes])
  // Notes whose [[links]] still name this note's old title, once typing the new title pauses.
  const [settledTitle, setSettledTitle] = useState(title)
  useEffect(() => {
    const timer = setTimeout(() => setSettledTitle(title), 600)
    return () => clearTimeout(timer)
  }, [title])
  const linksToOldTitle = useMemo(() => {
    const newTitle = settledTitle.trim()
    if (!linkedTitle || !newTitle || normalizeTitle(newTitle) === normalizeTitle(linkedTitle)) return []
    // Another note still has the old title, so those links already lead somewhere.
    const holder = titleIndex.get(normalizeTitle(linkedTitle))
    if (holder && holder.id !== note.id) return []
    // Handbook notes are read-only, so their links are never rewritten.
    return notesLinkingTo(notes.filter((item) => !isCoreId(item.id)), linkedTitle, note.id)
  }, [settledTitle, linkedTitle, titleIndex, notes, note.id])

  async function updateLinks() {
    const newTitle = title.trim()
    if (!newTitle) return
    setUpdatingLinks(true)
    // Save the new title first, so the updated links resolve to this note.
    if (await flush()) {
      const updated = await updateLinksAfterRename(linkedTitle, newTitle, note.id)
      if (updated !== undefined) setLinkedTitle(newTitle)
    }
    setUpdatingLinks(false)
  }
  // "Title", "Title#Section", or "#Section", which is a heading in this note.
  const resolveWikilink = useCallback((target: string): WikilinkTarget | undefined => {
    const title = targetTitle(target).trim()
    return title ? titleIndex.get(normalizeTitle(title)) : { id: note.id, title: note.title }
  }, [titleIndex, note.id, note.title])

  // ![[Note]] shows that note's saved content; ![[#Section]] would be this note, which the
  // preview declines to repeat.
  const resolveEmbed = useCallback((target: string): EmbeddedNote | undefined => {
    const title = targetTitle(target).trim()
    return title ? titleIndex.get(normalizeTitle(title)) : { id: note.id, title: note.title, content: '' }
  }, [titleIndex, note.id, note.title])

  // Headings suggested after "[[Title#": that note's, or this draft's for "[[#".
  const getLinkHeadings = useCallback((title: string) => {
    const source = title ? titleIndex.get(normalizeTitle(title))?.content : latest.current.content
    return source ? [...new Set(listHeadings(source).map((heading) => heading.text))] : []
  }, [titleIndex])

  // Showing a heading: the editor moves to its line and the preview scrolls to it.
  const [reveal, setReveal] = useState<{ line: number }>()
  const jumpToSection = useCallback((section: string) => {
    const heading = findHeading(latest.current.content, section)
    if (!heading) return false
    setReveal({ line: heading.line })
    const target = document.getElementById(`heading-${headingSlug(heading.text)}`)
    if (target) {
      target.setAttribute('tabindex', '-1')
      target.scrollIntoView?.({ block: 'start' })
      target.focus({ preventScroll: true })
    }
    return true
  }, [])
  // Opened from a [[Note#Section]] link in another note: show that heading once the preview is ready.
  const [sectionToShow, setSectionToShow] = useState(() => useEditorStore.getState().pendingSection ?? undefined)
  useEffect(() => {
    useEditorStore.getState().setPendingSection(null)
  }, [])
  useEffect(() => {
    if (!sectionToShow || shownSource === undefined) return
    const frame = requestAnimationFrame(() => {
      jumpToSection(sectionToShow)
      setSectionToShow(undefined)
    })
    return () => cancelAnimationFrame(frame)
  }, [sectionToShow, shownSource, jumpToSection])
  // One suggestion per title (the note a [[link]] would reach), in the library's order. Built the
  // first time "[[" is typed rather than when the note opens.
  const getLinkTitles = useMemo(() => {
    let titles: LinkTitle[] | undefined
    return () => (titles ??= toLinkTitles(
      notes.filter((item) => item.id !== note.id && titleIndex.get(normalizeTitle(item.title)) === item).map((item) => item.title),
    ))
  }, [notes, note.id, titleIndex])
  // Stable, so the preview's links do not re-render on every keystroke.
  const openWikilink = useCallback((target: WikilinkTarget) => {
    if (target.id === note.id) {
      if (target.section) jumpToSection(target.section)
      return
    }
    const related = noteById.get(target.id)
    if (!related) return
    useEditorStore.getState().setPendingSection(target.section ?? null)
    void openRelatedNoteRef.current(related)
  }, [noteById, note.id, jumpToSection])
  // [[Links]] in this note follow the preview, which trails typing in long notes, so finding them
  // never adds work to a keystroke.
  const textTargetIds = useMemo(() => {
    const ids = new Set<string>()
    for (const target of findWikilinkTargets(preview.source)) {
      const id = titleIndex.get(normalizeTitle(targetTitle(target)))?.id
      if (id && id !== note.id) ids.add(id)
    }
    return ids
  }, [preview.source, titleIndex, note.id])
  const storedTargetIds = useMemo(() => new Set(links.outgoing.map((link) => link.targetNoteId)), [links.outgoing])
  const outgoingNotes = [...new Set([...storedTargetIds, ...textTargetIds])]
    .map((id) => noteById.get(id))
    .filter((item): item is Note => Boolean(item))
  const backlinkNotes = [...new Set([
    ...links.backlinks.map((link) => link.sourceNoteId),
    ...textLinks.filter((link) => link.targetNoteId === note.id).map((link) => link.sourceNoteId),
  ])]
    .map((id) => noteById.get(id))
    .filter((item): item is Note => Boolean(item))
  const availableTargets = useMemo(
    () => notes.filter((item) => item.id !== note.id && !storedTargetIds.has(item.id) && !textTargetIds.has(item.id)),
    [storedTargetIds, textTargetIds, note.id, notes],
  )
  const canEditLinks = persisted && note.deletedAt === undefined
  const audioRecordingSupported =
    typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const toggleTask = useCallback((lineNumber: number) => {
    setContent((current) => toggleChecklistItem(current, lineNumber))
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) void closeSafely()
    }}>
      <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-heading" onKeyDown={(event) => keepFocusInDialog(event, () => void closeSafely())}>
        <header className="editor-header">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-button" onClick={() => void closeSafely()} aria-label={t("Close editor")}><ArrowLeft size={18} /></button>
            <div className="min-w-0">
              <p className="section-label">{t("Note editor")}</p>
              <h2 id="editor-heading" className="truncate text-sm font-semibold">{isCreating ? t("New note") : note.title || t("Untitled note")}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="save-status" role="status" aria-live="polite">
              {saveState === 'saving' ? t("Saving…") : saveState === 'unsaved' ? t("Unsaved changes") : <><Check size={14} /> {t("Saved")}</>}
            </span>
            <button className={`icon-button ${pinned ? 'is-selected' : ''}`} onClick={() => setPinned((value) => !value)} aria-label={pinned ? t("Unpin note") : t("Pin note")} aria-pressed={pinned}><Pin size={17} /></button>
            <button className={`icon-button ${favorite ? 'is-favorite' : ''}`} onClick={() => setFavorite((value) => !value)} aria-label={favorite ? t("Remove from favorites") : t("Add to favorites")} aria-pressed={favorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /></button>
            <button className="icon-button" onClick={() => void toggleHistory()} aria-label={t("Show note history")}><Clock3 size={17} /></button>
            <button className="icon-button" onClick={() => void closeSafely()} aria-label={t("Close editor")}><X size={17} /></button>
          </div>
        </header>
        <div className="editor-toolbar">
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]" htmlFor="note-notebook">{t("Notebook")}</label>
          <select id="note-notebook" className="small-input max-w-48" value={notebookId} onChange={(event) => {
            setNotebookId(event.target.value)
          }}>
            {notebooks.map((notebook) => <option value={notebook.id} key={notebook.id}>{notebook.name}</option>)}
          </select>
          <button className="secondary-button ms-auto" onClick={() => setPreviewOnly((value) => !value)} aria-pressed={previewOnly}>{previewOnly ? t('Edit') : t("Preview only")}</button>
        </div>
        <div className="editor-body">
          <div className="editor-fields">
            {changedElsewhere && (dirty || saveState !== 'saved') && (
              <div role="alert" className="notice notice-error flex-wrap">
                <span>{t("This note was changed in another tab. Autosave is paused so neither version is lost.")}</span>
                <span className="flex flex-wrap gap-2">
                  <button className="secondary-button" onClick={onKeepMine}>{t("Keep my version")}</button>
                  <button className="secondary-button" onClick={loadLatest}>{t("Load the other version")}</button>
                </span>
              </div>
            )}
            <label htmlFor="note-title" className="sr-only">{t("Note title")}</label>
            <input ref={titleRef} id="note-title" className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Untitled note")} />
            {linksToOldTitle.length > 0 && (
              <div className="rename-links" role="status">
                <span>
                  {tp(linksToOldTitle.length, '{count} note links to “{old}”. Update it to “{new}”?', '{count} notes link to “{old}”. Update them to “{new}”?', { old: linkedTitle, new: title.trim() })}
                </span>
                <span className="flex gap-2">
                  <button type="button" className="secondary-button" onClick={() => setLinkedTitle(title.trim())}>{t("Not now")}</button>
                  <button type="button" className="primary-button" disabled={updatingLinks} onClick={() => void updateLinks()}>
                    {updatingLinks ? t("Updating…") : t("Update links")}
                  </button>
                </span>
              </div>
            )}
            <div className="tag-editor">
              <TagIcon size={15} aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-1.5">
                {noteTags.map((tag) => (
                  <span className="tag-chip" key={tag}>{tag}<button onClick={() => setNoteTags((current) => current.filter((item) => item !== tag))} aria-label={t("Remove tag {tag}", { tag })}><X size={12} /></button></span>
                ))}
                <label className="sr-only" htmlFor="tag-input">{t("Add tags")}</label>
                <input id="tag-input" className="tag-input" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={tagKeyDown} onBlur={() => tagInput.trim() && addTag()} placeholder={t("Add a tag…")} />
              </div>
              {tagInput && suggestions.length > 0 && <div className="suggestion-list" role="listbox" aria-label={t("Tag suggestions")}>{suggestions.map((tag) => <button key={tag.id} role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag.label)}>{tag.label}</button>)}</div>}
            </div>
            <section className="note-links" aria-labelledby="note-links-heading">
              <h3 id="note-links-heading" className="mb-2 flex items-center gap-2 text-sm font-semibold"><Link2 size={15} aria-hidden="true" /> {t("Linked notes")}</h3>
              {canEditLinks && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="link-note-target">{t("Choose a note to link")}</label>
                  <NoteLinkPicker
                    // Remounting after a link is added or removed clears the search.
                    key={links.outgoing.length}
                    id="link-note-target"
                    targets={availableTargets}
                    labels={linkLabels}
                    selectedId={linkTargetId}
                    onSelect={setLinkTargetId}
                  />
                  <button className="secondary-button" onClick={() => void addLink()} disabled={!linkTargetId}>{t("Add link")}</button>
                </div>
              )}
              {linkError && <p className="mb-2 text-sm text-red-700" role="alert">{linkError}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-medium text-[var(--muted)]">{t("Links from this note")}</h4>
                  {outgoingNotes.length ? (
                    <ul className="note-link-list" aria-label={t("Links from this note")}>
                      {outgoingNotes.map((related) => (
                        <li key={related.id}>
                          {related.deletedAt === undefined ? (
                            <>
                              <button className="note-link-open" onClick={() => void openRelatedNote(related)}>{labelOf(related)}</button>
                              {canEditLinks && storedTargetIds.has(related.id) && <button className="note-link-remove" onClick={() => void removeLink(related.id)} aria-label={t("Remove link to {labelOf}", { labelOf: labelOf(related) })}>{t("Remove")}</button>}
                              {textTargetIds.has(related.id) && !storedTargetIds.has(related.id) && <span className="note-link-source" title={t("Linked with [[…]] in the text; remove it there")}>{t("in text")}</span>}
                            </>
                          ) : <span>{labelOf(related)} <span className="text-[var(--muted)]">{t("(in Trash; link retained)")}</span></span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-[var(--muted)]">{t("No linked notes yet.")}</p>}
                </div>
                <div>
                  <h4 className="text-xs font-medium text-[var(--muted)]">{t("Mentioned in")}</h4>
                  {backlinkNotes.length ? (
                    <ul className="note-link-list" aria-label={t("Mentioned in")}>
                      {backlinkNotes.map((related) => (
                        <li key={related.id}>
                          {related.deletedAt === undefined ? (
                            <button className="note-link-open" onClick={() => void openRelatedNote(related)}>{labelOf(related)}</button>
                          ) : <span>{labelOf(related)} <span className="text-[var(--muted)]">{t("(in Trash; link retained)")}</span></span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-[var(--muted)]">{t("No other notes mention this one yet.")}</p>}
                </div>
              </div>
              {!canEditLinks && !note.deletedAt && <p className="mt-2 text-xs text-[var(--muted)]">{t("Save this note before linking it.")}</p>}
              {note.deletedAt !== undefined && <p className="mt-2 text-xs text-[var(--muted)]">{t("Links are preserved while this note is in Trash.")}</p>}
            </section>
            <div className={`markdown-workspace ${previewOnly ? 'markdown-workspace-preview' : ''}`}>
              {!previewOnly && <div className="markdown-editor-pane">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p id="note-content-label" className="section-label">{t('Note text')}</p>
                  <div className="segmented" role="group" aria-label={t("Editor view")}>
                    <button type="button" aria-pressed={editorMode === 'live'} onClick={() => void changeEditorMode('live')} title={t('Show formatting as you write')}>{t('Formatted')}</button>
                    <button type="button" aria-pressed={editorMode === 'source'} onClick={() => void changeEditorMode('source')} title={t('Show the text exactly as typed, with its formatting marks')}>{t('Plain text')}</button>
                  </div>
                </div>
                <MarkdownEditor value={content} onChange={setContent} labelledBy="note-content-label" getLinkTitles={getLinkTitles} getLinkHeadings={getLinkHeadings} mode={editorMode} reveal={reveal} formattingBar placeholder={t('Write your note… Type / for headings, lists, checklists, and more.')} />
                <EditorTip />
              </div>}
              <article className="markdown-preview-pane" aria-label={t('Preview of your note')}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="section-label">{t('Preview')}</p>
                  {previewStale && preview.delayed && <span className="text-xs text-[var(--muted)]">{t("Long note: the preview updates when you pause typing")}</span>}
                  {checklistProgress.total > 0 && <span className="checklist-progress" role="progressbar" aria-label={t("Checklist progress")} aria-valuemin={0} aria-valuemax={checklistProgress.total} aria-valuenow={checklistProgress.completed}>
                    {tp(checklistProgress.total, '{done} of {count} complete', '{done} of {count} complete', { done: checklistProgress.completed })}
                  </span>}
                </div>
                <div className="prose-notes">
                  {shownSource === undefined ? (
                    <p className="text-sm text-[var(--muted)]" role="status">{t("Preparing the preview…")}</p>
                  ) : (
                    <MarkdownPreview
                      markdown={shownSource}
                      tree={parsedPreview?.tree}
                      showContents
                      onToggleTask={previewStale ? undefined : toggleTask}
                      resolveWikilink={resolveWikilink}
                      onOpenWikilink={openWikilink}
                      noteId={note.id}
                      resolveEmbed={resolveEmbed}
                    />
                  )}
                </div>
              </article>
            </div>
            <section className="attachments-section" aria-labelledby="attachments-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="attachments-heading" className="text-sm font-semibold">{t("Attachments")}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">{t("Stored on this device. Each file is limited to 5 MiB; 20 MiB per note.")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={attachmentFileRef}
                    id="note-attachments"
                    type="file"
                    multiple
                    className="sr-only"
                    aria-label={t("Choose files to attach")}
                    onChange={handleAttachmentFiles}
                  />
                  <button className="secondary-button" disabled={isAddingAttachment} onClick={() => attachmentFileRef.current?.click()}>
                    <Paperclip size={15} /> {t("Attach files")}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={isAddingAttachment || isRecording || !audioRecordingSupported}
                    onClick={() => void toggleAudioRecording()}
                    aria-pressed={isRecording}
                  >
                    {isRecording ? <Square size={15} /> : <Mic size={15} />}
                    {isRecording ? t("Stop recording") : t("Record audio")}
                  </button>
                </div>
              </div>
              {!audioRecordingSupported && <p className="mb-2 text-xs text-[var(--muted)]">{t("Audio recording is unavailable here; attach an audio file to play it in the note.")}</p>}
              {isRecording && <p className="mb-2 text-sm text-[var(--muted)]" role="status">{t("Recording audio…")}</p>}
              {isAddingAttachment && <p className="mb-2 text-sm text-[var(--muted)]" role="status">{t("Saving attachment…")}</p>}
              {attachmentError && <p className="mb-2 text-sm text-red-700" role="alert">{attachmentError}</p>}
              {attachments.length ? (
                <ul className="attachment-list" aria-label={t("Note attachments")}>
                  {attachments.map((attachment) => (
                    <AttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                      onDelete={() => void removeAttachment(attachment)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--muted)]">{t("No attachments yet.")}</p>
              )}
            </section>
            {saveError && <p className="text-sm text-red-700" role="alert">{saveError}<button className="ms-2 underline" onClick={() => void saveRef.current()}>{t("Retry")}</button></p>}
            <p className="text-xs text-[var(--muted)]">{t('Your note is saved on this device as you type.')}</p>
          </div>
          {showHistory && <aside className="history-panel" aria-label={t("Note history")}>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{t("History")}</h3><button className="icon-button !h-8 !w-8" onClick={() => setShowHistory(false)} aria-label={t("Close history")}><X size={15} /></button></div>
            {history.length ? history.map((entry) => <div className="history-item" key={entry.id}><time className="text-xs text-[var(--muted)]">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(entry.savedAt)}</time><p className="mt-1 truncate text-sm font-medium">{entry.snapshot.title || t("Untitled note")}</p><p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{entry.snapshot.content}</p><button className="secondary-button mt-2" onClick={() => void restore(entry)}>{t("Restore")}</button></div>) : <p className="text-sm text-[var(--muted)]">{t("Earlier saved versions will appear here after you edit this note.")}</p>}
          </aside>}
        </div>
        <footer className="editor-footer">
          <p className="text-xs text-[var(--muted)]">{t("Created")} {formatDate(note.createdAt)}</p>
          {!isCreating && <button className="danger-button" onClick={() => void deleteSafely()}><Trash2 size={15} /> {note.deletedAt === undefined ? t("Move to Trash") : t("Delete forever")}</button>}
          <button className="primary-button ms-auto" onClick={() => void closeSafely()}>{saveState === 'unsaved' ? t("Save and close") : t("Done")}</button>
        </footer>
      </section>
    </div>
  )
}

// The handbook reader uses the same preview, so it ships in this chunk (see noteEditorChunk.ts).
export { HandbookNote } from './HandbookNote'
