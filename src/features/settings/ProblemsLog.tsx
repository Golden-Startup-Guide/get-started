import { useState } from 'react'
import { Copy } from 'lucide-react'
import { t, tp } from '../../i18n/i18n'
import { problemReport, useProblemStore } from '../../state/problemStore'
import { APP_VERSION } from '../../version'

const ISSUES = 'https://github.com/Golden-Startup-Guide/get-started/issues/new'

/** "Problems" in Settings: what went wrong this session, to copy into a report. Nothing is sent. */
export function ProblemsLog() {
  const problems = useProblemStore((state) => state.problems)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(problemReport(problems, APP_VERSION))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mt-3">
      <p className="text-sm" aria-live="polite">
        {problems.length
          ? tp(problems.length, '{count} problem since the app opened.', '{count} problems since the app opened.')
          : t('No problems since the app opened.')}
      </p>
      {problems.length > 0 && (
        <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-[var(--muted)]">
          {problems.slice(-5).reverse().map((problem) => (
            <li key={problem.at + problem.message}>{new Date(problem.at).toLocaleTimeString()} · {problem.message}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {problems.length > 0 && (
          <button type="button" className="secondary-button" onClick={() => void copy()}>
            <Copy size={15} aria-hidden="true" /> {copied ? t('Copied') : t('Copy details')}
          </button>
        )}
        <a className="secondary-button" href={ISSUES} target="_blank" rel="noopener noreferrer">{t('Report a problem')}</a>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {t('The app sends no error reports. Copy the details into a report if you want to; they include the version, the browser, and the error messages, which can name a note or notebook, so check them first.')}
      </p>
    </div>
  )
}
