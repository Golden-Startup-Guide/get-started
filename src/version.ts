declare const __APP_VERSION__: string

/** The app's version, from package.json (see docs/RELEASING.md). */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development'
