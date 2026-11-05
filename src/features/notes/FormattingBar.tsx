import type { ReactNode } from 'react'
import type { Command } from '@codemirror/view'
import { Bold, Heading, Italic, Link, List, ListChecks, ListOrdered, NotebookText, Quote } from 'lucide-react'
import { t } from '../../i18n/i18n'
import { BOLD, insertLink, insertNoteLink, ITALIC, toggleLineStart } from './formatting'

const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = IS_APPLE ? '⌘' : 'Ctrl+'

/**
 * Buttons for the formatting people expect from a word processor. Each writes the Markdown it
 * stands for, so nobody has to know it. They keep the editor's selection (mouse down does not
 * take focus) and return focus to the text.
 */
export function FormattingBar({ run }: { run: (command: Command) => void }) {
  const askForLink = () => window.prompt(t('Link to which web address?'), 'https://')
  const button = (label: string, icon: ReactNode, command: Command, shortcut?: string) => (
    <button
      type="button"
      className="formatting-button"
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      title={shortcut ? `${label} (${shortcut})` : label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(command)}
    >
      {icon}
    </button>
  )
  return (
    <div className="formatting-bar" role="group" aria-label={t('Formatting')}>
      {button(t('Bold'), <Bold size={16} aria-hidden="true" />, BOLD, `${MOD}B`)}
      {button(t('Italic'), <Italic size={16} aria-hidden="true" />, ITALIC, `${MOD}I`)}
      <span className="formatting-divider" aria-hidden="true" />
      {button(t('Heading'), <Heading size={16} aria-hidden="true" />, toggleLineStart('heading'))}
      {button(t('Bulleted list'), <List size={16} aria-hidden="true" />, toggleLineStart('bullet'))}
      {button(t('Numbered list'), <ListOrdered size={16} aria-hidden="true" />, toggleLineStart('numbered'))}
      {button(t('Checklist'), <ListChecks size={16} aria-hidden="true" />, toggleLineStart('checklist'))}
      {button(t('Quote'), <Quote size={16} aria-hidden="true" />, toggleLineStart('quote'))}
      <span className="formatting-divider" aria-hidden="true" />
      {button(t('Link to a web page'), <Link size={16} aria-hidden="true" />, insertLink(askForLink))}
      {button(t('Link to a note'), <NotebookText size={16} aria-hidden="true" />, insertNoteLink)}
    </div>
  )
}
