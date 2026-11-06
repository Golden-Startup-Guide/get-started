/** The built-in handbooks, compiled from content/ by scripts/coreContent.ts. */
declare module 'virtual:core-content' {
  export const catalog: import('./types').CoreCatalog
  /** Loads one library's notes, by library id. */
  export const loaders: Record<string, () => Promise<import('./types').CoreNote[]>>
}
