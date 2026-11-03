import { createContext, memo, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import type { Root } from 'hast'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { ExtraProps } from 'react-markdown'
import { createTaskTextLookup } from './checklists'
import { loadHighlighter, MAX_HIGHLIGHT_LENGTH } from './codeHighlight'
import { markdownToHast } from './markdownToHast'
import { NoteContents } from './NoteContents'
import { collectHeadings } from './noteHeadings'

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
      aria-label={taskText ? `Mark task ${taskText} ${checked ? 'incomplete' : 'complete'}` : 'Toggle checklist task'}
      onChange={() => lineNumber && onToggleTask?.(lineNumber)}
    />
  )
}

export interface WikilinkTarget {
  id: string
  title: string
}

interface WikilinkContextValue {
  /** The note a `[[title]]` points to, if one exists. */
  resolve?: (title: string) => WikilinkTarget | undefined
  open?: (target: WikilinkTarget) => void
}

const WikilinkContext = createContext<WikilinkContextValue>({})

function Wikilink({ title, children }: { title: string; children: ReactNode }) {
  const { resolve, open } = useContext(WikilinkContext)
  const target = resolve?.(title)
  if (!target || !open) {
    return <span className="wikilink wikilink-missing" title={`No note titled “${title}” yet`}>{children}</span>
  }
  return (
    <a
      href="#"
      className="wikilink"
      title={`Open note ${target.title || 'Untitled note'}`}
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
      Load image{props.alt ? ` “${props.alt}”` : ''} from {host}
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
  return (
    <code {...props} className={tree ? `${className} hljs` : className}>
      {tree ? toJsxRuntime(tree, { Fragment, jsx, jsxs }) : children}
    </code>
  )
}

const markdownComponents: Partial<Components> = {
  code: CodeBlock,
  a: MarkdownLink,
  img: MarkdownImage,
  input: TaskCheckbox,
  li: MarkdownListItem,
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
  return (
    <ChecklistContext.Provider value={checklist}>
      <WikilinkContext.Provider value={wikilinks}>
        <NoteContents headings={headings} />
        <RenderedMarkdown tree={shownTree} />
      </WikilinkContext.Provider>
    </ChecklistContext.Provider>
  )
}
