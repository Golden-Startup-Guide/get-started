import { beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// Node's BroadcastChannel would deliver change messages between test modules sharing a
// process; tests that need cross-tab messages install their own fake.
Reflect.deleteProperty(globalThis, 'BroadcastChannel')

// jsdom has no layout or scrolling. The virtualized note grid (TanStack Virtual, scrolling with
// the window) calls window.scrollTo, which jsdom only reports as "Not implemented"; real
// browsers are covered by the Playwright tests.
window.scrollTo = () => undefined

// The page's address holds where the reader is (see src/lib/routes.ts); each test starts on the
// start page rather than wherever the test before it ended.
beforeEach(() => {
  if (typeof window !== 'undefined') window.history.replaceState(null, '', '/')
})
