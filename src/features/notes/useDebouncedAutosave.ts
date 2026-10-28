import { useCallback, useEffect, useRef } from 'react'

export function useDebouncedAutosave(
  dirty: boolean,
  draftKey: string,
  save: () => Promise<boolean>,
  delay = 650,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSave = useRef(save)
  const saveOnUnmount = useRef(true)
  latestSave.current = save

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const flush = useCallback(async () => {
    clearTimer()
    return latestSave.current()
  }, [clearTimer])

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
      void latestSave.current()
    }, delay)
    return clearTimer
  }, [clearTimer, delay, dirty, draftKey])

  useEffect(
    () => () => {
      clearTimer()
      if (saveOnUnmount.current) void latestSave.current()
    },
    [clearTimer],
  )

  return { flush, cancel, skipUnmountSave, resumeUnmountSave }
}
