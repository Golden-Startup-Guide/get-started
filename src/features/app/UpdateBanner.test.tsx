import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../state/editorStore'
import { updateReady, useUpdateStore } from '../../state/updateStore'
import { UpdateBanner } from './UpdateBanner'

describe('update banner', () => {
  afterEach(() => {
    cleanup()
    useUpdateStore.setState({ ready: false, dismissed: false, activate: undefined })
    useEditorStore.getState().setFlush(null)
  })

  it('appears only once a new version is waiting, and Later hides it', async () => {
    const user = userEvent.setup()
    render(<UpdateBanner />)
    expect(screen.queryByRole('region', { name: 'Update available' })).not.toBeInTheDocument()
    updateReady(vi.fn(async () => undefined))
    expect(await screen.findByRole('region', { name: 'Update available' })).toHaveTextContent('A new version of the app is ready.')
    await user.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('region', { name: 'Update available' })).not.toBeInTheDocument()
  })

  it('saves the open note before reloading, and waits if it cannot be saved', async () => {
    const user = userEvent.setup()
    const activate = vi.fn(async () => undefined)
    const order: string[] = []
    let saves = false
    useEditorStore.getState().setFlush(async () => {
      order.push('save')
      return saves
    })
    activate.mockImplementation(async () => {
      order.push('reload')
    })
    render(<UpdateBanner />)
    updateReady(activate)

    // The note cannot be saved: no reload, and the button can be tried again.
    await user.click(await screen.findByRole('button', { name: 'Reload to update' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reload to update' })).toBeEnabled())
    expect(activate).not.toHaveBeenCalled()

    saves = true
    await user.click(screen.getByRole('button', { name: 'Reload to update' }))
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1))
    expect(order).toEqual(['save', 'save', 'reload'])
  })
})
