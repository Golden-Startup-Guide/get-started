/** Built-in handbook items have ids starting with this (see content/README.md); personal ones never do. */
export const CORE_ID_PREFIX = 'core-'

/** Whether an id belongs to a built-in handbook item, which is read-only. */
export function isCoreId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith(CORE_ID_PREFIX)
}
