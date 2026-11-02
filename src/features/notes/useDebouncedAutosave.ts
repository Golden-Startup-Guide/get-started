import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

export function useDebouncedAutosave(
  dirty: boolean,
  /** Any value whose identity changes when the draft changes (compared with ===). */
  draftKey: unknown,
  save: () => Promise<boolean>,
  delay = 650,
  /** Stops the debounce timer only; explicit flushes and page-exit saves still run. */
  paused = false,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSave = useRef(save)
  const latestDraftKey = useRef(draftKey)
  const inFlight = useRef<{ draftKey: unknown; promise: Promise<boolean> } | null>(null)
  const saveOnUnmount = useRef(true)
  const latestDirty = useRef(dirty)

  // Timers and page-exit handlers read the newest values through refs, updated once each
  // render commits (never during render itself).
  useLayoutEffect(() => {
    latestSave.current = save
    latestDraftKey.current = draftKey
    latestDirty.current = dirty
  })

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const saveLatest = useCallback(async () => {
    while (true) {
      const pending = inFlight.current
      if (pending) {
        const saved = await pending.promise
        if (!saved) return false
        if (latestDraftKey.current === pending.draftKey) return true
        continue
      }

      const currentDraftKey = latestDraftKey.current
      const request = { draftKey: currentDraftKey, promise: latestSave.current() }
      inFlight.current = request
      let saved: boolean
      try {
        saved = await request.promise
      } catch (reason) {
        if (inFlight.current === request) inFlight.current = null
        throw reason
      }
      if (inFlight.current === request) inFlight.current = null
      if (!saved) return false
      if (latestDraftKey.current === currentDraftKey) return true
    }
  }, [])

  const flush = useCallback(async () => {
    clearTimer()
    return saveLatest()
  }, [clearTimer, saveLatest])

  const cancel = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const skipUnmountSave = useCallback(() => {
    saveOnUnmount.current = false
  }, [])

  const resumeUnmountSave = useCallback(() => {
    saveOnUnmount.current = true
  }, [])

  useEffect(() => {
    if (!dirty || paused) return
    clearTimer()
    timer.current = setTimeout(() => {
      timer.current = null
      void saveLatest()
    }, delay)
    return clearTimer
  }, [clearTimer, delay, dirty, draftKey, paused, saveLatest])

  useEffect(
    () => () => {
      clearTimer()
      if (saveOnUnmount.current) void saveLatest()
    },
    [clearTimer, saveLatest],
  )

  // Unmount cleanup does not run when the tab closes or reloads, so save as soon as the
  // page is hidden and warn before leaving while a draft is unsaved or still saving.
  useEffect(() => {
    // While a delete is in progress (skipUnmountSave), saving would recreate the note.
    const hasPendingWork = () =>
      saveOnUnmount.current && (latestDirty.current || inFlight.current !== null)
    const saveNow = () => {
      if (!hasPendingWork()) return
      clearTimer()
      void saveLatest().catch(() => undefined)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveNow()
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingWork()) return
      saveNow()
      event.preventDefault()
      event.returnValue = ''
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', saveNow)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', saveNow)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [clearTimer, saveLatest])

  return { flush, cancel, skipUnmountSave, resumeUnmountSave }
}
