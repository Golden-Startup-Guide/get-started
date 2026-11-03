import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Production only: the dev server injects an inline script (React refresh) that this
// policy would block. Remote https images are allowed because the preview loads them on
// request; everything else must come from the app itself.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'my-notes-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy }, injectTo: 'head-prepend' },
    ],
  }
}

// Web Workers have no `document`. Vite resolves packages with the "browser" condition even inside
// workers, which picks decode-named-character-reference's DOM version (used by the Markdown
// parser) and crashes the preview worker. Point the worker build at the package's worker version.
function workerSafeEntityDecoder(): Plugin {
  return {
    name: 'my-notes-worker-safe-entity-decoder',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source !== 'decode-named-character-reference') return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved && { ...resolved, id: resolved.id.replace(/index\.dom\.js$/, 'index.js') }
    },
  }
}

export default defineConfig({
  build: {
    // Never inline fonts as data: URLs (Vite inlines small files by default): the Content Security
    // Policy only allows fonts from the app itself. KaTeX ships several fonts under 4 KB.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined),
  },
  worker: {
    format: 'es',
    plugins: () => [workerSafeEntityDecoder()],
  },
  plugins: [
    react(),
    contentSecurityPolicyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['my-notes.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'My Notes',
        short_name: 'My Notes',
        description: 'A quiet, private place for all the things you want to remember.',
        theme_color: '#f8f7f4',
        background_color: '#f8f7f4',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/my-notes.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        // Maths (KaTeX's script, styles, and 19 fonts, about 0.7 MB) is left out of the install
        // download, which every user pays; it is fetched when a note first shows maths and then
        // kept for offline use. File names are content-hashed, so cache-first is always fresh.
        globIgnores: ['**/mathRenderer-*', '**/KaTeX_*'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(mathRenderer-|KaTeX_)/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'my-notes-maths',
              expiration: { maxEntries: 60 },
            },
          },
        ],
      },
    }),
  ],
})
