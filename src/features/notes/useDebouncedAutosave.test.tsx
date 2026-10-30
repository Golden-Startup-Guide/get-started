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
})
