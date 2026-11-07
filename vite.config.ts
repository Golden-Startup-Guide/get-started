import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { version } from './package.json'
import { coreContentPlugin } from './scripts/coreContent'

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

// Where the app is served from: '/' locally and in tests, '/get-started/' on GitHub Pages
// (set by the Deploy workflow). Every path below follows it.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  // The version shown in Settings and in problem reports (from package.json).
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    // Never inline fonts as data: URLs (Vite inlines small files by default): the Content Security
    // Policy only allows fonts from the app itself. KaTeX ships several fonts under 4 KB.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined),
    // The chunks over Vite's default 500 kB warning are all loaded on demand (the note editor,
    // and Mermaid's diagram types); what users must download is limited by the budgets in
    // scripts/checkSizes.mjs, which CI enforces.
    chunkSizeWarningLimit: 800,
  },
  worker: {
    format: 'es',
    plugins: () => [workerSafeEntityDecoder()],
  },
  plugins: [
    react(),
    coreContentPlugin(fileURLToPath(new URL('./content', import.meta.url))),
    contentSecurityPolicyPlugin(),
    VitePWA({
      // A new version waits until the user chooses to reload (see src/state/updateStore.ts), so
      // the page never reloads under someone mid-edit. Registration is in src/main.tsx.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['my-notes.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'The Personal Knowledge Library',
        short_name: 'The Personal Knowledge Library',
        description: 'A calm, private library for reading and keeping knowledge, offline.',
        theme_color: '#f7f5f0',
        background_color: '#f7f5f0',
        id: base,
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        categories: ['productivity', 'utilities'],
        // Long-press (or right-click) the app's icon for these.
        shortcuts: [
          { name: 'New note', url: `${base}?action=new` },
          { name: 'Quick note', url: `${base}?action=quick` },
          { name: 'Today’s note', url: `${base}?action=today` },
        ],
        // On Android, the installed app appears in the share menu; what is shared is saved to Inbox.
        share_target: {
          action: base,
          method: 'GET',
          params: { title: 'share-title', text: 'share-text', url: 'share-url' },
        },
        icons: [
          {
            src: `${base}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: `${base}my-notes.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // The first install takes control at once, so the app works offline from the first visit.
        clientsClaim: true,
        navigateFallback: `${base}index.html`,
        // The install download, which every user pays, holds only the app's core: the page, its
        // script and styles, the note editor, the preview and search workers, the code highlighter,
        // and icons. Maths (KaTeX and its fonts, about 0.7 MB) and diagrams (Mermaid, 56 files
        // and about 3.3 MB) are fetched when a note first uses them.
        globPatterns: [
          '*.{html,js,svg,png,ico,webmanifest}',
          'assets/{index,NoteEditor,pagesChunk,markdownPreview.worker,search.worker,highlighter,htmlToMarkdown}-*.{js,css}',
          // Loaded by the service worker registration in main.tsx, on every start.
          'assets/workbox-window*.js',
          // The built-in handbooks, one file per library (scripts/coreContent.ts): readable offline
          // from the first launch, with their pictures.
          'assets/core-*.js',
          'assets/picture-*.{svg,png,jpg,jpeg,webp}',
        ],
        runtimeCaching: [
          {
            // Everything else the app loads from /assets/ is kept after its first use, so maths and
            // diagrams work offline from then on. File names are content-hashed, so cache-first
            // never serves a stale file.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'my-notes-on-demand',
              expiration: { maxEntries: 200, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
})
