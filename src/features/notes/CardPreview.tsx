import { useMemo } from 'react'
import { CheckSquare, Code, FunctionSquare, Image, Network, Square, Table } from 'lucide-react'
import { t } from '../../i18n/i18n'
import { cardPreview, type PreviewBlock } from './previewBlocks'
import { highlight } from './noteDisplay'

const OBJECTS: Record<Extract<PreviewBlock, { kind: 'object' }>['object'], { icon: typeof Table; label: () => string }> = {
  table: { icon: Table, label: () => t('Table') },
  code: { icon: Code, label: () => t('Code') },
  formula: { icon: FunctionSquare, label: () => t('Formula') },
  diagram: { icon: Network, label: () => t('Diagram') },
  image: { icon: Image, label: () => t('Image') },
}

/** The start of a note, as it reads: headings, lists, and checkboxes, without formatting marks. */
export function CardPreview({ content, highlights }: { content: string; highlights: readonly string[] }) {
  const blocks = useMemo(() => cardPreview(content), [content])
  if (!blocks.length) return <p className="card-preview-empty">{t('No content yet.')}</p>
  return (
    <div className="card-preview">
      {blocks.map((block, index) => {
        if (block.kind === 'object') {
          const { icon: Icon, label } = OBJECTS[block.object]
          return <span key={index} className="card-preview-object"><Icon size={12} aria-hidden="true" /> {label()}</span>
        }
        const text = highlight(block.text, highlights)
        const indent = 'depth' in block && block.depth ? { marginInlineStart: `${block.depth * 0.9}rem` } : undefined
        switch (block.kind) {
          case 'heading':
            return <p key={index} className="card-preview-heading">{text}</p>
          case 'quote':
            return <p key={index} className="card-preview-quote">{text}</p>
          case 'bullet':
            return <p key={index} className="card-preview-item" style={indent}><span className="card-preview-marker" aria-hidden="true">•</span>{text}</p>
          case 'numbered':
            return <p key={index} className="card-preview-item" style={indent}><span className="card-preview-marker" aria-hidden="true">{block.number}.</span>{text}</p>
          case 'task':
            return (
              <p key={index} className={`card-preview-item ${block.done ? 'card-preview-done' : ''}`} style={indent}>
                <span className="card-preview-marker" role="img" aria-label={block.done ? t('Done:') : t('To do:')}>
                  {block.done ? <CheckSquare size={13} /> : <Square size={13} />}
                </span>
                {text}
              </p>
            )
          default:
            return <p key={index}>{text}</p>
        }
      })}
    </div>
  )
}
