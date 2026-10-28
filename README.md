# My Notes

A responsive, offline-first notes app built with React, TypeScript, Vite, and Tailwind CSS. Notes are stored in IndexedDB on the current browser and device; there is no account, server, or cloud sync.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

The production build includes a web app manifest, install icons, and a service worker that precaches the app shell. After the first successful load, the app shell is available offline. Install it from the browser's install option on supported desktop and mobile browsers. Service workers require HTTPS in production; localhost is supported for development.

Notes stay in the browser profile where they were created. Clearing that browser's site data removes them, and notes do not automatically sync between devices.
