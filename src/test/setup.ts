import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// Node's BroadcastChannel would deliver change messages between test modules sharing a
// process; tests that need cross-tab messages install their own fake.
Reflect.deleteProperty(globalThis, 'BroadcastChannel')
