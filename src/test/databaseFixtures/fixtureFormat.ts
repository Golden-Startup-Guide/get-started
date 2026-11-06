/**
 * A saved IndexedDB database: its version, every store and index exactly as created, and every
 * record. Used to keep sample libraries made by past versions of the app, so each upgrade is
 * tested against what those versions really stored (see upgrades.test.ts).
 */
export interface DatabaseFixture {
  /** Where the sample came from: the commit (or "current") and what it holds. */
  description: string
  name: string
  version: number
  stores: Array<{
    name: string
    keyPath: string | string[] | null
    autoIncrement: boolean
    indexes: Array<{ name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }>
    records: Array<{ key: unknown; value: unknown }>
  }>
}

// JSON cannot hold binary data; ArrayBuffers (attachment contents) are kept as Base64.
const BINARY = '$arrayBuffer'

// Checked by type tag: buffers read back from IndexedDB can come from another realm, where
// instanceof ArrayBuffer is false.
const isArrayBuffer = (value: unknown): value is ArrayBuffer => Object.prototype.toString.call(value) === '[object ArrayBuffer]'

function encode(value: unknown): unknown {
  if (isArrayBuffer(value)) {
    let text = ''
    for (const byte of new Uint8Array(value)) text += String.fromCharCode(byte)
    return { [BINARY]: btoa(text) }
  }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))
  return value
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    const binary = (value as Record<string, unknown>)[BINARY]
    if (typeof binary === 'string') return Uint8Array.from(atob(binary), (char) => char.charCodeAt(0)).buffer
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]))
  }
  return value
}

const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

/** Reads a whole database (from the global indexedDB) into a fixture. */
export async function dumpDatabase(name: string, description: string): Promise<DatabaseFixture> {
  const db = await request(indexedDB.open(name))
  const storeNames = [...db.objectStoreNames].sort()
  const transaction = db.transaction(storeNames)
  const stores: DatabaseFixture['stores'] = []
  for (const storeName of storeNames) {
    const store = transaction.objectStore(storeName)
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
    stores.push({
      name: storeName,
      keyPath: store.keyPath,
      autoIncrement: store.autoIncrement,
      indexes: [...store.indexNames].sort().map((indexName) => {
        const index = store.index(indexName)
        return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry }
      }),
      records: keys.map((key, position) => ({ key: encode(key), value: encode(values[position]) })),
    })
  }
  db.close()
  return { description, name, version: db.version, stores }
}

/** Recreates a fixture's database (in the global indexedDB), exactly as it was saved. */
export async function restoreDatabase(fixture: DatabaseFixture): Promise<void> {
  const open = indexedDB.open(fixture.name, fixture.version)
  open.onupgradeneeded = () => {
    const db = open.result
    for (const saved of fixture.stores) {
      const store = db.createObjectStore(saved.name, { keyPath: saved.keyPath, autoIncrement: saved.autoIncrement })
      for (const index of saved.indexes) store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry })
      for (const record of saved.records) {
        if (saved.keyPath === null) store.put(decode(record.value), decode(record.key) as IDBValidKey)
        else store.put(decode(record.value))
      }
    }
  }
  const db = await request(open)
  db.close()
}

/** A record's decoded value, for comparing with what an upgraded database holds. */
export const fixtureRecords = (fixture: DatabaseFixture, store: string): unknown[] =>
  (fixture.stores.find((saved) => saved.name === store)?.records ?? []).map((record) => decode(record.value))
