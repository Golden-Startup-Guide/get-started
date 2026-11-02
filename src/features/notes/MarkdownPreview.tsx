import { createContext, memo, useContext, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getChecklistTaskText } from './checklists'
import { remarkWikilinks } from './remarkWikilinks'

interface ChecklistContextValue {
  markdown: string
  /** Absent while the preview is behind the draft: line numbers may no longer match. */
  onToggleTask?: (lineNumber: number) => void
}

const ChecklistContext = createContext<ChecklistContextValue>({ markdown: '' })
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
  const { markdown, onToggleTask } = useContext(ChecklistContext)
  if (props.type !== 'checkbox') return <input {...props} />
  const taskText = lineNumber ? getChecklistTaskText(markdown, lineNumber) : ''
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

const markdownComponents: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  input: TaskCheckbox,
  li: MarkdownListItem,
}

const remarkPlugins = [remarkGfm, remarkWikilinks]

// Parsing is the expensive part of rendering a note, so the parsed tree depends on the Markdown
// text alone. Whether checkboxes are interactive travels through context, which re-renders
// only the checkboxes: passing it as a prop here re-parsed the whole note (seconds for 1 MB)
// at the first keystroke after every pause, when the preview became stale.
const ParsedMarkdown = memo(function ParsedMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
      {markdown || '_Nothing to preview yet._'}
    </ReactMarkdown>
  )
})

export function MarkdownPreview({
  markdown,
  onToggleTask,
  resolveWikilink,
  onOpenWikilink,
}: {
  markdown: string
  /** Omit to make checklist boxes read-only. */
  onToggleTask?: (lineNumber: number) => void
  /** Omit both to show `[[links]]` as plain text that cannot be followed. */
  resolveWikilink?: (title: string) => WikilinkTarget | undefined
  onOpenWikilink?: (target: WikilinkTarget) => void
}) {
  const checklist = useMemo(() => ({ markdown, onToggleTask }), [markdown, onToggleTask])
  const wikilinks = useMemo(() => ({ resolve: resolveWikilink, open: onOpenWikilink }), [resolveWikilink, onOpenWikilink])
  return (
    <ChecklistContext.Provider value={checklist}>
      <WikilinkContext.Provider value={wikilinks}>
        <ParsedMarkdown markdown={markdown} />
      </WikilinkContext.Provider>
    </ChecklistContext.Provider>
  )
}
