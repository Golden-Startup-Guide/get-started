import { describe, expect, it } from 'vitest'
import { workPerKeystroke, type TraceEvent } from './typingLatency'

const keydown = (ts: number): TraceEvent => ({ name: 'EventDispatch', ph: 'X', ts, dur: 100, pid: 1, tid: 1, args: { data: { type: 'keydown' } } })
const task = (ts: number, dur: number, tid = 1): TraceEvent => ({ name: 'ThreadControllerImpl::RunTask', ph: 'X', ts, dur, pid: 1, tid })

describe('workPerKeystroke', () => {
  it('sums main-thread task time within each keystroke window, ignoring idle gaps', () => {
    // Key 1 at 0 ms: tasks of 3 ms and 2 ms. Key 2 at 40 ms: one task of 5 ms.
    const events = [keydown(0), task(0, 3_000), task(10_000, 2_000), keydown(40_000), task(40_000, 5_000)]
    expect(workPerKeystroke(events, 40)).toEqual([5, 5])
  })

  it('splits a task that straddles two keystrokes between them', () => {
    const events = [keydown(0), task(38_000, 4_000), keydown(40_000)]
    expect(workPerKeystroke(events, 40)).toEqual([2, 2])
  })

  it('ignores other threads and returns nothing without keystrokes', () => {
    expect(workPerKeystroke([keydown(0), task(0, 9_000, 2)], 40)).toEqual([0])
    expect(workPerKeystroke([task(0, 9_000)], 40)).toEqual([])
  })
})
