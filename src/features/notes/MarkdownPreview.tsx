import { createContext, useContext, useState, type ComponentProps } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getChecklistTaskText } from './checklists'

interface ChecklistContextValue {
  markdown: string
  onToggleTask: (lineNumber: number) => void
}

const ChecklistContext = createContext<ChecklistContextValue>({ markdown: '', onToggleTask: () => undefined })
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
      disabled={!lineNumber}
      aria-label={taskText ? `Mark task ${taskText} ${checked ? 'incomplete' : 'complete'}` : 'Toggle checklist task'}
      onChange={() => lineNumber && onToggleTask(lineNumber)}
    />
  )
}

// Following a link in this tab would leave the app mid-edit; footnote links stay in-page.
function MarkdownLink({ node: _node, ...props }: ComponentProps<'a'> & ExtraProps) {
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

export function MarkdownPreview({
  markdown,
  onToggleTask,
}: {
  markdown: string
  onToggleTask: (lineNumber: number) => void
}) {
  return (
    <ChecklistContext.Provider value={{ markdown, onToggleTask }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdown || '_Nothing to preview yet._'}
      </ReactMarkdown>
    </ChecklistContext.Provider>
  )
}
