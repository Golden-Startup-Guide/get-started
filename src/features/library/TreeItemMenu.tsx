import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { t } from '../../i18n/i18n'

export type MoveOption = { id: string; label: string }

/**
 * The "⋯" actions menu beside a library, shelf, or notebook in the sidebar tree.
 *
 * Follows the WAI-ARIA menu button pattern: arrow keys move between items, Escape and Tab close
 * the menu and return focus to its button, and a click outside closes it. Escape is consumed here
 * so it does not also close the navigation drawer around the menu.
 */
export function TreeItemMenu({
  name,
  onRename,
  onDelete,
  deleteDisabledReason,
  moveOptions,
  currentMoveId,
  onMove,
}: {
  name: string
  onRename: () => void
  onDelete: () => void
  deleteDisabledReason?: string
  moveOptions?: MoveOption[]
  currentMoveId?: string
  onMove?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const focusOnOpen = useRef<'first' | 'last'>('first')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  function openMenu(focus: 'first' | 'last') {
    focusOnOpen.current = focus
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    // Open upward when the menu would run past the bottom of the scrolling sidebar.
    const button = buttonRef.current
    const menu = menuRef.current
    const scroller = button?.closest('.workspace-sidebar')
    if (button && menu && scroller) {
      const spaceBelow = scroller.getBoundingClientRect().bottom - button.getBoundingClientRect().bottom
      setOpenUpward(spaceBelow < menu.offsetHeight + 8)
    }
    const all = items()
    ;(focusOnOpen.current === 'last' ? all[all.length - 1] : all[0])?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowUp' ? 'last' : 'first')
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = items()
    const index = all.indexOf(document.activeElement as HTMLElement)
    const focusAt = (next: number) => all[(next + all.length) % all.length]?.focus()
    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1)
        break
      case 'ArrowUp':
        focusAt(index - 1)
        break
      case 'Home':
        focusAt(0)
        break
      case 'End':
        focusAt(all.length - 1)
        break
      case 'Escape':
      case 'Tab':
        close(true)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function choose(action: () => void) {
    close(true)
    action()
  }

  return (
    <div className="tree-actions relative shrink-0" data-open={open}>
      <button
        ref={buttonRef}
        className="icon-button !h-8 !w-8"
        aria-label={t("Actions for {name}", { name })}
        title={t("More actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu('first'))}
        onKeyDown={onButtonKeyDown}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`${name} actions`}
          className="tree-menu"
          data-upward={openUpward}
          onKeyDown={onMenuKeyDown}
        >
          <button role="menuitem" tabIndex={-1} className="tree-menu-item" onClick={() => choose(onRename)}>
            <Pencil size={14} aria-hidden="true" /> {t("Rename")}
          </button>
          {moveOptions && onMove && moveOptions.length > 1 && (
            <div role="group" aria-labelledby={`${menuId}-move`} className="tree-menu-group">
              <p id={`${menuId}-move`} className="tree-menu-label">{t("Move to shelf")}</p>
              {moveOptions.map((option) => {
                const current = option.id === currentMoveId
                return (
                  <button
                    key={option.id}
                    role="menuitemradio"
                    aria-checked={current}
                    tabIndex={-1}
                    className="tree-menu-item"
                    onClick={() => choose(() => { if (!current) onMove(option.id) })}
                  >
                    <span className="tree-menu-check">{current && <Check size={14} aria-hidden="true" />}</span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          <button
            role="menuitem"
            tabIndex={-1}
            className="tree-menu-item tree-menu-danger"
            aria-disabled={deleteDisabledReason ? true : undefined}
            title={deleteDisabledReason}
            onClick={() => { if (!deleteDisabledReason) choose(onDelete) }}
          >
            <Trash2 size={14} aria-hidden="true" /> {t("Delete")}
          </button>
        </div>
      )}
    </div>
  )
}
