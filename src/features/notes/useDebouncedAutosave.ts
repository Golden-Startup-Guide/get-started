import { useCallback, useEffect, useRef } from 'react'

export function useDebouncedAutosave(
  dirty: boolean,
  draftKey: string,
  save: () => Promise<boolean>,
  delay = 650,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSave = useRef(save)
  const latestDraftKey = useRef(draftKey)
  const inFlight = useRef<{ draftKey: string; promise: Promise<boolean> } | null>(null)
  const saveOnUnmount = useRef(true)
  latestSave.current = save
  latestDraftKey.current = draftKey

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
    if (!dirty) return
    clearTimer()
    timer.current = setTimeout(() => {
      timer.current = null
      void saveLatest()
    }, delay)
    return clearTimer
  }, [clearTimer, delay, dirty, draftKey, saveLatest])

  useEffect(
    () => () => {
      clearTimer()
      if (saveOnUnmount.current) void saveLatest()
    },
    [clearTimer, saveLatest],
  )

  return { flush, cancel, skipUnmountSave, resumeUnmountSave }
}
