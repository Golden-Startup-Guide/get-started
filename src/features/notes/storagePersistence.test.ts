import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStoragePersistence, requestStoragePersistence } from './storagePersistence'

function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage })
}

describe('storage persistence', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'storage')
  })

  it('reports unsupported when the Storage API is unavailable', async () => {
    stubStorage(undefined)
    expect(await getStoragePersistence()).toBe('unsupported')
    expect(await requestStoragePersistence()).toBe('unsupported')
  })

  it('reports the current status and the result of a request', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist })
    expect(await getStoragePersistence()).toBe('best-effort')
    expect(await requestStoragePersistence()).toBe('persisted')
    expect(persist).toHaveBeenCalledOnce()
  })

  it('treats a denied or failing request as best-effort', async () => {
    stubStorage({ persisted: vi.fn().mockRejectedValue(new Error('blocked')), persist: vi.fn().mockResolvedValue(false) })
    expect(await getStoragePersistence()).toBe('best-effort')
    expect(await requestStoragePersistence()).toBe('best-effort')
  })
})
