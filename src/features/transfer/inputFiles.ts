import { strFromU8, unzipSync } from 'fflate'

/** A file to import, with its path inside the chosen folder or .zip ("Vault/Ideas/Plan.md"). */
export interface InputFile {
  path: string
  data: Uint8Array
}

/** Files as chosen: a .zip is opened and its files used (with the folders inside it). */
export async function readInputFiles(files: readonly File[]): Promise<InputFile[]> {
  const result: InputFile[] = []
  for (const file of files) {
    const data = await bytesOf(file)
    // A folder chosen with "Choose a folder…" gives each file's path within it.
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    if (/\.zip$/i.test(file.name)) {
      for (const [inner, bytes] of Object.entries(unzipSync(data))) {
        if (!inner.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(inner)) result.push({ path: inner, data: bytes })
      }
    } else result.push({ path, data })
  }
  return result
}

// With a fallback for test environments whose File has no arrayBuffer().
function bytesOf(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

export const textOf = (file: InputFile) => strFromU8(file.data).replace(/^\uFEFF/, '')
export const baseName = (path: string) => path.split('/').pop() ?? path
export const stem = (path: string) => baseName(path).replace(/\.[^.]+$/, '')
/** The folder a file is in, or '' at the top. */
export const folderOf = (path: string) => path.split('/').slice(0, -1).pop() ?? ''

const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', mp4: 'video/mp4',
  txt: 'text/plain', csv: 'text/csv', json: 'application/json',
}
export const typeOf = (name: string) => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

/** Finds a file a note refers to: by path relative to the note, then by name anywhere. */
export function findReferenced(files: readonly InputFile[], from: string, reference: string): InputFile | undefined {
  let target: string
  try {
    target = decodeURIComponent(reference.split(/[?#]/)[0])
  } catch {
    target = reference
  }
  const folder = from.split('/').slice(0, -1)
  const parts = [...folder]
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  const relative = parts.join('/')
  return files.find((file) => file.path === relative)
    ?? files.find((file) => file.path.endsWith(`/${target}`) || file.path === target)
    ?? files.find((file) => baseName(file.path) === baseName(target))
}
