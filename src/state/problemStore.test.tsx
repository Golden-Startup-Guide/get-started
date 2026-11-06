import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProblemsLog } from '../features/settings/ProblemsLog'
import { problemReport, recordProblem, useProblemStore } from './problemStore'
import { useWorkspaceStore } from './workspaceStore'

describe('problems log', () => {
  afterEach(() => {
    cleanup()
    useProblemStore.setState({ problems: [] })
    vi.unstubAllGlobals()
  })

  it('keeps the latest problems in memory, including every error shown', () => {
    useWorkspaceStore.getState().showError('The note could not be updated.')
    useWorkspaceStore.getState().showError(null)
    for (let index = 0; index < 40; index += 1) recordProblem(`Problem ${index}`, 'uncaught')
    const { problems } = useProblemStore.getState()
    expect(problems).toHaveLength(30)
    expect(problems.at(-1)).toEqual({ at: expect.any(Number), message: 'Problem 39', kind: 'uncaught' })
    recordProblem('   ', 'shown')
    expect(useProblemStore.getState().problems).toHaveLength(30)
  })

  it('reports the version, browser, and problems for a report the user sends', () => {
    recordProblem('The backup could not be written.', 'shown')
    const report = problemReport(useProblemStore.getState().problems, '1.2.3')
    expect(report).toMatch(/^The Personal Knowledge Library 1\.2\.3\nBrowser: .+\nLanguage: \w+\n\n\d{4}-\d\d-\d\dT.+ \[shown\] The backup could not be written\.$/)
  })

  it('shows the problems in Settings and copies the details', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, userAgent: navigator.userAgent })
    render(<ProblemsLog />)
    expect(screen.getByText('No problems since the app opened.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy details' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', 'https://github.com/Golden-Startup-Guide/get-started/issues/new')

    recordProblem('Storage is full.', 'shown')
    expect(await screen.findByText('1 problem since the app opened.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy details' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('[shown] Storage is full.'))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
