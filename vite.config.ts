import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    host: true,
    port: 5173,
    // Live-reload from iPad uses the LAN Host header, which Vite 6+ blocks
    // unless allowed. `true` permits any host (dev-only server).
    allowedHosts: true,
    strictPort: process.env.CAPACITOR_LIVE === '1',
    // Don't let Vite recurse into the Capacitor shell or its baked-in
    // copy of an old build (where stale minified JS confuses the scanner).
    fs: {
      deny: ['capacitor-shell/**'],
    },
  },
  // Constrain dependency pre-bundling to the real entry only, so the
  // scanner won't crawl into capacitor-shell/ios/App/App/public/*.html.
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    // Do NOT use aggressive manualChunks here: splitting firebase/react into
    // shared vendor files created circular chunk imports (firebase ↔ vendor ↔
    // react) that white-screened the Capacitor/production app on boot.
    // Route-level React.lazy in Router.tsx is enough for code-splitting.
    chunkSizeWarningLimit: 900,
  },
})
