import { createContext, memo, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import type { Element, Root } from 'hast'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { ExtraProps } from 'react-markdown'
import { extractSection, sectionOf } from '../../lib/headings'
import { targetTitle } from '../../lib/wikilinks'
import { createTaskTextLookup } from './checklists'
import { loadHighlighter, MAX_HIGHLIGHT_LENGTH } from './codeHighlight'
import { DiagramBlock } from './DiagramBlock'
import { MathFormula } from './MathFormula'
import { markdownToHast, type CalloutKind } from './markdownToHast'
import { NoteContents } from './NoteContents'
import { collectHeadings } from './noteHeadings'
import { t } from '../../i18n/i18n'

interface ChecklistContextValue {
  /** A task's text by source line, for its checkbox's label (see createTaskTextLookup). */
  taskText: (lineNumber: number) => string
  /** Absent while the preview is behind the draft: line numbers may no longer match. */
  onToggleTask?: (lineNumber: number) => void
}

const ChecklistContext = createContext<ChecklistContextValue>({ taskText: () => '' })
// Each list item exposes its source line, so its checkbox toggles exactly that line.
// Counting rendered checkboxes instead breaks when task syntax appears in code blocks.
const ListItemLineContext = createContext<number | undefined>(undefined)

const CALLOUT_LABELS: Record<CalloutKind, () => string> = {
  note: () => t('Note'),
  tip: () => t('Tip'),
  important: () => t('Important'),
  warning: () => t('Warning'),
  caution: () => t('Caution'),
}

/** A callout ("> [!NOTE]"): a labelled box, named for screen readers by its label. */
function Callout({ node: _node, children, ...props }: ComponentProps<'aside'> & ExtraProps & { 'data-callout'?: CalloutKind }) {
  const kind = props['data-callout']
  if (!kind || !CALLOUT_LABELS[kind]) return <aside {...props}>{children}</aside>
  const label = CALLOUT_LABELS[kind]()
  return (
    <aside {...props} className={`callout callout-${kind}`} aria-label={label}>
      <p className="callout-label">{label}</p>
      {children}
    </aside>
  )
}

function MarkdownListItem({ node, ...props }: ComponentProps<'li'> & ExtraProps) {
  return (
    <ListItemLineContext.Provider value={node?.position?.start.line}>
      <li {...props} />
    </ListItemLineContext.Provider>
  )
}

function TaskCheckbox({ node: _node, checked, ...props }: ComponentProps<'input'> & ExtraProps) {
  const lineNumber = useContext(ListItemLineContext)
  const { taskText: taskTextOf, onToggleTask } = useContext(ChecklistContext)
  if (props.type !== 'checkbox') return <input {...props} />
  const taskText = lineNumber ? taskTextOf(lineNumber) : ''
  return (
    <input
      {...props}
      type="checkbox"
      checked={Boolean(checked)}
      disabled={!lineNumber || !onToggleTask}
      aria-label={taskText ? (checked ? t('Mark task {taskText} incomplete', { taskText }) : t('Mark task {taskText} complete', { taskText })) : t("Toggle checklist task")}
      onChange={() => lineNumber && onToggleTask?.(lineNumber)}
    />
  )
}

export interface WikilinkTarget {
  id: string
  title: string
  /** The heading a [[Note#Section]] link points to. */
  section?: string
}

interface WikilinkContextValue {
  /** The note a link target ("Title", "Title#Section", or "#Section" for this note) points to, if any. */
  resolve?: (target: string) => WikilinkTarget | undefined
  open?: (target: WikilinkTarget) => void
}

const WikilinkContext = createContext<WikilinkContextValue>({})

function Wikilink({ title, children }: { title: string; children: ReactNode }) {
  const { resolve, open } = useContext(WikilinkContext)
  const resolved = resolve?.(title)
  if (!resolved || !open) {
    return <span className="wikilink wikilink-missing" title={t("No note titled “{value}” yet", { value: targetTitle(title).trim() })}>{children}</span>
  }
  const target = { ...resolved, section: sectionOf(title) }
  return (
    <a
      href="#"
      className="wikilink"
      title={target.section ? t('Open note {title} at “{section}”', { title: target.title || t('Untitled note'), section: target.section }) : t('Open note {title}', { title: target.title || t('Untitled note') })}
      onClick={(event) => {
        event.preventDefault()
        open(target)
      }}
    >
      {children}
    </a>
  )
}

// Following a link in this tab would leave the app mid-edit; footnote links stay in-page.
function MarkdownLink({ node: _node, ...props }: ComponentProps<'a'> & ExtraProps) {
  const wikilink = (props as Record<string, unknown>)['data-wikilink']
  if (typeof wikilink === 'string') return <Wikilink title={wikilink}>{props.children}</Wikilink>
  return props.href?.startsWith('#')
    ? <a {...props} />
    : <a {...props} target="_blank" rel="noopener noreferrer" />
}

function remoteHost(src: string | undefined): string | undefined {
  if (!src) return undefined
  try {
    const url = new URL(src, window.location.href)
    return url.origin !== window.location.origin && /^https?:$/.test(url.protocol) ? url.host : undefined
  } catch {
    return undefined
  }
}

// Remote images reveal that a note was opened (tracking pixels), so they load only on request.
function MarkdownImage({ node: _node, ...props }: ComponentProps<'img'> & ExtraProps) {
  const [loaded, setLoaded] = useState(false)
  const host = remoteHost(props.src)
  if (!host || loaded) return <img {...props} />
  return (
    <button type="button" className="secondary-button" onClick={() => setLoaded(true)}>
      {props.alt ? t('Load image “{alt}” from {host}', { alt: props.alt, host }) : t('Load image from {host}', { host })}
    </button>
  )
}

/**
 * Fenced code with a language ("```js") is coloured once the highlighter has loaded; until then,
 * and for unknown languages, it shows as plain text. Inline code is never highlighted.
 */
function CodeBlock({ node, className, children, ...props }: ComponentProps<'code'> & ExtraProps) {
  const language = /(?:^|\s)language-([\w+#-]+)/.exec(className ?? '')?.[1]?.toLowerCase()
  const text = node?.children.length === 1 && node.children[0].type === 'text' ? node.children[0].value : undefined
  const [highlighted, setHighlighted] = useState<{ text: string; tree: Root }>()

  useEffect(() => {
    if (!language || text === undefined || text.length > MAX_HIGHLIGHT_LENGTH) return
    let active = true
    loadHighlighter().then(
      (highlight) => {
        const tree = highlight(text, language)
        if (active && tree) setHighlighted({ text, tree })
      },
      // Offline before the highlighter was cached: plain code is still fine.
      () => undefined,
    )
    return () => { active = false }
  }, [language, text])

  const tree = highlighted && highlighted.text === text ? highlighted.tree : undefined
  // $$…$$ inside a line. (Maths blocks are caught by MathAwarePre.)
  if (language === 'math' && text !== undefined) return <MathFormula tex={text} display={false} />
  return (
    <code {...props} className={tree ? `${className} hljs` : className}>
      {tree ? toJsxRuntime(tree, { Fragment, jsx, jsxs }) : children}
    </code>
  )
}

/** A $$ block or ```math block becomes displayed maths rather than a code box. */
function MathAwarePre({ node, children, ...props }: ComponentProps<'pre'> & ExtraProps) {
  const code = node?.children.find((child) => child.type === 'element')
  const classes = code?.type === 'element' && code.tagName === 'code' && Array.isArray(code.properties.className)
    ? code.properties.className
    : []
  const text = () => (code?.type === 'element' ? code.children.map((child) => (child.type === 'text' ? child.value : '')).join('').replace(/\n$/, '') : '')
  if (classes.includes('language-math')) return <MathFormula tex={text()} display />
  // A ```mermaid block becomes a diagram.
  if (classes.includes('language-mermaid')) return <DiagramBlock source={text()} />
  return <pre {...props}>{children}</pre>
}

export interface EmbeddedNote {
  id: string
  title: string
  content: string
}

interface EmbedContextValue {
  /** The note a ![[target]] embeds, with its saved content. */
  resolve?: (target: string) => EmbeddedNote | undefined
  /** Notes being shown, outermost first: the note itself, then any embeds around this point. */
  ancestors: string[]
}

const EmbedContext = createContext<EmbedContextValue>({ ancestors: [] })
/** Embeds inside embeds stop here; deeper ones show as links. */
export const MAX_EMBED_DEPTH = 3
/** Longer embedded text is cut short, with a link to read the rest in the note itself. */
export const MAX_EMBED_LENGTH = 20_000
// Embedded copies are read-only and add no heading anchors, so they never clash with the host note's.
const READ_ONLY_CHECKLIST: ChecklistContextValue = { taskText: () => '' }

/** An embedded note's text, cut to MAX_EMBED_LENGTH and parsed without heading anchors. */
function parseEmbedded(text: string): Root {
  const shown = text.length > MAX_EMBED_LENGTH ? `${text.slice(0, MAX_EMBED_LENGTH)}\n\n…` : text
  const tree = markdownToHast(shown || '_This note is empty._')
  visitElements(tree, (element) => {
    if (/^h[1-6]$/.test(element.tagName)) delete element.properties.id
  })
  return tree
}

function visitElements(node: Root | Element, each: (element: Element) => void) {
  for (const child of node.children) {
    if (child.type === 'element') {
      each(child)
      visitElements(child, each)
    }
  }
}

function EmbeddedBody({ text }: { text: string }) {
  const tree = useMemo(() => parseEmbedded(text), [text])
  return (
    <div className="note-embed-body">
      <RenderedMarkdown tree={tree} />
      {text.length > MAX_EMBED_LENGTH && <p className="note-embed-message">{t("Open the note to read the rest.")}</p>}
    </div>
  )
}

/** ![[Note]] or ![[Note#Section]] on its own line: the other note's content, shown in place. */
function NoteEmbed({ target }: { target: string }) {
  const { resolve, ancestors } = useContext(EmbedContext)
  const { open } = useContext(WikilinkContext)
  const note = resolve?.(target)
  const section = sectionOf(target)
  const text = !note ? undefined : section ? extractSection(note.content, section) : note.content
  const label = note ? `${note.title || t('Untitled note')}${section ? ` › ${section}` : ''}` : targetTitle(target).trim()

  let problem: string | undefined
  if (!note) problem = t('No note titled “{title}” to show here.', { title: label })
  else if (ancestors.includes(note.id)) problem = `“${label}” is already shown above, so it is not repeated here.`
  else if (ancestors.length > MAX_EMBED_DEPTH) problem = t('Too many notes inside notes to show this one here.')
  else if (text === undefined) problem = t('“{title}” has no section “{section}”.', { title: note.title || t('Untitled note'), section: section ?? '' })

  return (
    <section className={problem ? 'note-embed note-embed-problem' : 'note-embed'} aria-label={t("Embedded: {label}", { label })}>
      <header className="note-embed-header">
        {note && open
          ? <a href="#" className="wikilink" onClick={(event) => { event.preventDefault(); open({ id: note.id, title: note.title, section }) }}>{label}</a>
          : <span>{label}</span>}
      </header>
      {problem ? (
        <p className="note-embed-message">{problem}</p>
      ) : (
        <EmbedContext.Provider value={{ resolve, ancestors: [...ancestors, note!.id] }}>
          <ChecklistContext.Provider value={READ_ONLY_CHECKLIST}>
            <EmbeddedBody text={text!} />
          </ChecklistContext.Provider>
        </EmbedContext.Provider>
      )}
    </section>
  )
}

function EmbedOrDiv({ node: _node, ...props }: ComponentProps<'div'> & ExtraProps) {
  const embed = (props as Record<string, unknown>)['data-embed']
  if (typeof embed === 'string') return <NoteEmbed target={embed} />
  return <div {...props} />
}

const markdownComponents: Partial<Components> = {
  code: CodeBlock,
  div: EmbedOrDiv,
  pre: MathAwarePre,
  a: MarkdownLink,
  img: MarkdownImage,
  input: TaskCheckbox,
  li: MarkdownListItem,
  aside: Callout,
}

const EMPTY_PREVIEW = '_Nothing to preview yet._'

// Rendering depends on the parsed tree alone. Whether checkboxes are interactive travels through
// context, which re-renders only the checkboxes: passing it as a prop here re-rendered (and
// before, re-parsed) the whole note at the first keystroke after every pause.
const RenderedMarkdown = memo(function RenderedMarkdown({ tree }: { tree: Root }) {
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components: markdownComponents,
    ignoreInvalidStyle: true,
    passKeys: true,
    passNode: true,
  })
})

export function MarkdownPreview({
  markdown,
  tree,
  showContents = false,
  onToggleTask,
  resolveWikilink,
  onOpenWikilink,
  noteId,
  resolveEmbed,
}: {
  /** The Markdown shown; with `tree`, the Markdown the tree was parsed from. */
  markdown: string
  /** Already parsed (by useMarkdownTree, in a worker) for long notes; otherwise parsed here. */
  tree?: Root
  /** Show a table of contents when the note has enough headings. */
  showContents?: boolean
  /** Omit to make checklist boxes read-only. */
  onToggleTask?: (lineNumber: number) => void
  /** Omit both to show `[[links]]` as plain text that cannot be followed. */
  resolveWikilink?: (title: string) => WikilinkTarget | undefined
  onOpenWikilink?: (target: WikilinkTarget) => void
  /** The note shown, so it never embeds itself. */
  noteId?: string
  /** Omit to show ![[embeds]] as "nothing to show" placeholders. */
  resolveEmbed?: (target: string) => EmbeddedNote | undefined
}) {
  // Short notes are parsed here, on the main thread; it takes a few milliseconds. Only when the
  // Markdown changes: not when checkboxes become read-only and back while typing.
  const ownTree = useMemo(() => (tree ? undefined : markdownToHast(markdown || EMPTY_PREVIEW)), [tree, markdown])
  const shownTree = tree ?? ownTree!
  const headings = useMemo(() => (showContents ? collectHeadings(shownTree) : []), [showContents, shownTree])
  // Split per Markdown version, not per change in interactivity, so pausing and resuming typing
  // does not split a long note again.
  const taskText = useMemo(() => createTaskTextLookup(markdown), [markdown])
  const checklist = useMemo(() => ({ taskText, onToggleTask }), [taskText, onToggleTask])
  const wikilinks = useMemo(() => ({ resolve: resolveWikilink, open: onOpenWikilink }), [resolveWikilink, onOpenWikilink])
  const embeds = useMemo(() => ({ resolve: resolveEmbed, ancestors: noteId ? [noteId] : [] }), [resolveEmbed, noteId])
  return (
    <ChecklistContext.Provider value={checklist}>
      <WikilinkContext.Provider value={wikilinks}>
        <EmbedContext.Provider value={embeds}>
          <NoteContents headings={headings} />
          <RenderedMarkdown tree={shownTree} />
        </EmbedContext.Provider>
      </WikilinkContext.Provider>
    </ChecklistContext.Provider>
  )
}
