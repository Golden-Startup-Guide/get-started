import { create } from 'zustand'

/** A problem seen this session: an error shown to the user, or one the app did not catch. */
export interface Problem {
  at: number
  message: string
  /** Where it came from: an error message shown, or an uncaught error in the page. */
  kind: 'shown' | 'uncaught'
}

const KEPT = 30

interface ProblemState {
  problems: Problem[]
}

/**
 * Problems seen since the app opened, kept in memory only: nothing is stored or sent. Settings
 * offers to copy them, with the version and browser, for a report the user chooses to send.
 */
export const useProblemStore = create<ProblemState>()(() => ({ problems: [] }))

export function recordProblem(message: string, kind: Problem['kind']) {
  const text = message.trim().slice(0, 500)
  if (!text) return
  useProblemStore.setState((state) => ({ problems: [...state.problems, { at: Date.now(), message: text, kind }].slice(-KEPT) }))
}

/** Records errors the app did not catch (call once, at start-up). */
export function listenForProblems() {
  window.addEventListener('error', (event) => recordProblem(event.message || String(event.error), 'uncaught'))
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    recordProblem(reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason), 'uncaught')
  })
}

/** The details to paste into a report: version, browser, language, and the problems. */
export function problemReport(problems: readonly Problem[], version: string): string {
  return [
    `The Personal Knowledge Library ${version}`,
    `Browser: ${navigator.userAgent}`,
    `Language: ${document.documentElement.lang || 'en'}`,
    '',
    ...problems.map((problem) => `${new Date(problem.at).toISOString()} [${problem.kind}] ${problem.message}`),
  ].join('\n')
}
