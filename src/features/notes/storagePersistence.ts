// Browsers may evict "best-effort" storage under pressure (and Safari clears data for
// sites that are not installed after 7 days without use). Persistent storage is exempt.
export type StoragePersistence = 'persisted' | 'best-effort' | 'unsupported'

function storageManager(): StorageManager | undefined {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  return typeof storage?.persisted === 'function' && typeof storage.persist === 'function'
    ? storage
    : undefined
}

export async function getStoragePersistence(): Promise<StoragePersistence> {
  const storage = storageManager()
  if (!storage) return 'unsupported'
  try {
    return (await storage.persisted()) ? 'persisted' : 'best-effort'
  } catch {
    return 'best-effort'
  }
}

export async function requestStoragePersistence(): Promise<StoragePersistence> {
  const storage = storageManager()
  if (!storage) return 'unsupported'
  try {
    return (await storage.persist()) ? 'persisted' : 'best-effort'
  } catch {
    return 'best-effort'
  }
}
