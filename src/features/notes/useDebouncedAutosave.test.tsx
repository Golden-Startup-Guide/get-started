import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedAutosave } from './useDebouncedAutosave'

describe('useDebouncedAutosave', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('serializes an in-flight save before flushing a newer draft', async () => {
    vi.useFakeTimers()
    let finishFirstSave!: (saved: boolean) => void
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
        finishFirstSave = resolve
      }))
      .mockResolvedValue(true)
    const { result, rerender, unmount } = renderHook(
      ({ draftKey }: { draftKey: string }) => useDebouncedAutosave(true, draftKey, save),
      { initialProps: { draftKey: 'first draft' } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    expect(save).toHaveBeenCalledOnce()

    rerender({ draftKey: 'latest draft' })
    let flushPromise!: Promise<boolean>
    await act(async () => {
      flushPromise = result.current.flush()
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledOnce()

    await act(async () => {
      finishFirstSave(true)
      await expect(flushPromise).resolves.toBe(true)
    })
    expect(save).toHaveBeenCalledTimes(2)

    act(() => result.current.skipUnmountSave())
    unmount()
  })

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  function dispatchBeforeUnload() {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('saves a pending draft immediately when the page is hidden', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(true)
    const { result, unmount } = renderHook(() => useDebouncedAutosave(true, 'draft', save))

    await act(async () => {
      setVisibility('hidden')
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    expect(save).toHaveBeenCalledOnce()

    setVisibility('visible')
    act(() => result.current.skipUnmountSave())
    unmount()
  })

  it('warns before unload only while a draft is unsaved', async () => {
    const save = vi.fn().mockResolvedValue(true)
    const { rerender, result, unmount } = renderHook(
      ({ dirty }: { dirty: boolean }) => useDebouncedAutosave(dirty, 'draft', save),
      { initialProps: { dirty: false } },
    )
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
    expect(save).not.toHaveBeenCalled()

    rerender({ dirty: true })
    let event!: Event
    await act(async () => {
      event = dispatchBeforeUnload()
      await Promise.resolve()
    })
    expect(event.defaultPrevented).toBe(true)
    expect(save).toHaveBeenCalledOnce()

    act(() => result.current.skipUnmountSave())
    unmount()
  })

  it('does not save on page exit while a delete is in progress', async () => {
    const save = vi.fn().mockResolvedValue(true)
    const { result, unmount } = renderHook(() => useDebouncedAutosave(true, 'draft', save))
    act(() => result.current.skipUnmountSave())

    setVisibility('hidden')
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
    window.dispatchEvent(new Event('pagehide'))
    expect(save).not.toHaveBeenCalled()

    setVisibility('visible')
    unmount()
  })
})
