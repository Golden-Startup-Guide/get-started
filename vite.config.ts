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

export default defineConfig({
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
      },
    }),
  ],
})
