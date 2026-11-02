import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TreeItemMenu } from './TreeItemMenu'

const shelves = [
  { id: 'a', label: 'Personal Library · General' },
  { id: 'b', label: 'Personal Library · Archive' },
]

function renderMenu(props: Partial<Parameters<typeof TreeItemMenu>[0]> = {}) {
  const handlers = { onRename: vi.fn(), onDelete: vi.fn(), onMove: vi.fn() }
  const onOuterKeyDown = vi.fn()
  render(
    <div onKeyDown={onOuterKeyDown}>
      <TreeItemMenu name="Work" moveOptions={shelves} currentMoveId="a" {...handlers} {...props} />
      <button>Outside</button>
    </div>,
  )
  return { ...handlers, onOuterKeyDown }
}

describe('TreeItemMenu', () => {
  afterEach(cleanup)

  it('opens from its button, focuses the first item, and moves with the arrow keys', async () => {
    const user = userEvent.setup()
    renderMenu()
    const button = screen.getByRole('button', { name: 'Actions for Work' })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: 'Personal Library · General' })).toHaveFocus()
    expect(screen.getByRole('menuitemradio', { name: 'Personal Library · General' })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()
  })

  it('moves to another shelf and does nothing for the current one', async () => {
    const user = userEvent.setup()
    const { onMove } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'Actions for Work' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Personal Library · General' }))
    expect(onMove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Actions for Work' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Personal Library · Archive' }))
    expect(onMove).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Work' })).toHaveFocus()
  })

  it('closes on Escape without letting it reach the drawer, and returns focus', async () => {
    const user = userEvent.setup()
    const { onOuterKeyDown } = renderMenu()
    screen.getByRole('button', { name: 'Actions for Work' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Work' })).toHaveFocus()
    expect(onOuterKeyDown).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }))
  })

  it('closes when clicking outside', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Actions for Work' }))
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renames, deletes, and explains why delete is unavailable', async () => {
    const user = userEvent.setup()
    const { onRename, onDelete } = renderMenu({ deleteDisabledReason: 'The last notebook cannot be deleted' })
    await user.click(screen.getByRole('button', { name: 'Actions for Work' }))
    const remove = screen.getByRole('menuitem', { name: 'Delete' })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveAttribute('title', 'The last notebook cannot be deleted')
    await user.click(remove)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onRename).toHaveBeenCalledOnce()
  })

  it('leaves out the move section when there is only one shelf', async () => {
    const user = userEvent.setup()
    renderMenu({ moveOptions: [shelves[0]] })
    await user.click(screen.getByRole('button', { name: 'Actions for Work' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument()
  })
})
